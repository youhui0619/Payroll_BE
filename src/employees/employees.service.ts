import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { PageDto, paginated } from '../common/page.dto';
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
  SalaryDto,
} from './employees.dto';
import { EMPLOYMENT_STATUS_VALUES } from './employment-statuses';
import { WORKING_DAY_NAMES } from '../workforce/working-schedule.dto';

@Injectable()
export class EmployeesService {
  constructor(private db: Database) {}
  private async validateReferences(
    tx: Prisma.TransactionClient,
    companyId: string,
    dto: Pick<
      CreateEmployeeDto,
      'departmentId' | 'positionId' | 'managerId' | 'locationId' | 'scheduleId'
    >,
    currentDepartmentId?: string | null,
    employeeId?: string,
  ) {
    const departmentId =
      dto.departmentId !== undefined ? dto.departmentId : currentDepartmentId;
    if (dto.departmentId) {
      const department = await tx.department.findFirst({
        where: { id: dto.departmentId, companyId, active: true },
      });
      if (!department) throw new NotFoundException('Department not found.');
    }
    if (dto.positionId) {
      const position = await tx.position.findFirst({
        where: { id: dto.positionId, companyId, active: true },
      });
      if (!position) throw new NotFoundException('Position not found.');
      if (!departmentId || position.departmentId !== departmentId)
        throw new UnprocessableEntityException(
          'Position must belong to the selected department.',
        );
    }
    if (dto.managerId) {
      if (dto.managerId === employeeId)
        throw new UnprocessableEntityException(
          'An employee cannot report to themself.',
        );
      const manager = await tx.employee.findFirst({
        where: { id: dto.managerId, companyId, active: true },
      });
      if (!manager) throw new NotFoundException('Manager not found.');
    }
    if (dto.locationId) {
      const location = await tx.workLocation.findFirst({
        where: { id: dto.locationId, companyId, active: true },
      });
      if (!location) throw new NotFoundException('Location not found.');
    }
    if (dto.scheduleId) {
      const schedule = await tx.workSchedule.findFirst({
        where: { id: dto.scheduleId, companyId, active: true },
      });
      if (!schedule) throw new NotFoundException('Schedule not found.');
    }
  }
  private validateWorkingSchedule(
    schedule: CreateEmployeeDto['workingSchedule'],
  ) {
    if (!schedule) return;
    const days = schedule.days.map((day) => day.day);
    if (
      new Set(days).size !== WORKING_DAY_NAMES.length ||
      WORKING_DAY_NAMES.some((name) => !days.includes(name))
    )
      throw new UnprocessableEntityException(
        'Working schedule must contain exactly one entry for each day of the week.',
      );
    for (const day of schedule.days) {
      if ((day.breakStartTime === '') !== (day.breakEndTime === ''))
        throw new UnprocessableEntityException(
          'Break start and end times must both be provided or both be empty.',
        );
      if (
        day.breakStartTime &&
        day.breakEndTime &&
        day.breakStartTime >= day.breakEndTime
      )
        throw new UnprocessableEntityException(
          'Break end time must be later than break start time.',
        );
    }
  }
  private async defaultScheduleId(
    tx: Prisma.TransactionClient,
    companyId: string,
    employmentType?: string,
  ) {
    if (!employmentType) return null;
    const schedule = await tx.workSchedule.findFirst({
      where: { companyId, employmentType, active: true },
      orderBy: { effectiveFrom: 'desc' },
      select: { id: true },
    });
    return schedule?.id ?? null;
  }
  async list(companyId: string, q: EmployeeQueryDto) {
    const search = q.search?.trim();
    const commonWhere: Prisma.EmployeeWhereInput = {
      companyId,
      ...(q.active !== undefined ? { active: q.active } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.positionId ? { positionId: q.positionId } : {}),
      ...(q.employmentType ? { employmentType: q.employmentType } : {}),
      ...(search
        ? {
            OR: [
              {
                employeeNo: { contains: search, mode: 'insensitive' as const },
              },
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const where: Prisma.EmployeeWhereInput = {
      ...commonWhere,
      ...(q.employmentStatus ? { employmentStatus: q.employmentStatus } : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.employee.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          employeeNo: true,
          name: true,
          email: true,
          active: true,
          joinedDate: true,
          employmentStatus: true,
          employmentType: true,
          department: { select: { id: true, code: true, name: true } },
          position: {
            select: { id: true, code: true, title: true, jobLevel: true },
          },
          manager: { select: { id: true, employeeNo: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
        },
      }),
      this.db.employee.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      EMPLOYMENT_STATUS_VALUES.map((status) =>
        this.db.employee.count({
          where: { ...commonWhere, employmentStatus: status },
        }),
      ),
    );
    const statusCounts = Object.fromEntries(
      EMPLOYMENT_STATUS_VALUES.map((status, index) => [
        status,
        statusCountValues[index],
      ]),
    );
    return paginated(rows, total, q, {
      summary: { statusCounts },
    });
  }
  async managers(companyId: string, q: PageDto) {
    const where = {
      companyId,
      active: true,
      position: {
        is: { active: true, jobLevel: 'MANAGER' },
      },
    };
    const [data, total] = await this.db.$transaction([
      this.db.employee.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          employeeNo: true,
          name: true,
          email: true,
          department: { select: { id: true, code: true, name: true } },
          position: {
            select: { id: true, code: true, title: true, jobLevel: true },
          },
        },
      }),
      this.db.employee.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async get(companyId: string, id: string) {
    const data = await this.db.employee.findUnique({
      where: { companyId_id: { companyId, id } },
      include: {
        department: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, code: true, title: true } },
        manager: { select: { id: true, employeeNo: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        schedule: true,
        employeeWorkSchedule: true,
        membership: {
          select: {
            id: true,
            active: true,
            roles: true,
            user: { select: { id: true, email: true, fullName: true } },
          },
        },
        salaries: { orderBy: { effectiveFrom: 'desc' } },
      },
    });
    if (!data) throw new NotFoundException();
    const { employeeWorkSchedule, ...employee } = data;
    const salaryHistory = data.salaries.map((salary) => ({
      ...salary,
      amount: salary.amount.toFixed(2),
    }));
    const currentSalary = salaryHistory[0] ?? null;
    return {
      data: {
        ...employee,
        workingSchedule:
          employeeWorkSchedule?.scheduleDays ??
          data.schedule?.scheduleDays ??
          null,
        salaries: salaryHistory,
        salaryHistory,
        currentSalary,
      },
    };
  }
  async create(companyId: string, dto: CreateEmployeeDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.validateReferences(tx, companyId, dto);
        this.validateWorkingSchedule(dto.workingSchedule);
        const defaultScheduleId =
          dto.scheduleId !== undefined
            ? dto.scheduleId
            : await this.defaultScheduleId(tx, companyId, dto.employmentType);

        const {
          joinedDate,
          dateOfBirth,
          confirmationDate,
          resignationDate,
          overtimeHourlyRate,
          medicalLeaveEntitlement,
          basicSalary,
          scheduleId: ignoredScheduleId,
          workingSchedule,
          ...rest
        } = dto;
        void ignoredScheduleId;
        const joined = new Date(joinedDate + 'T00:00:00.000Z');
        const employee = await tx.employee.create({
          data: {
            ...rest,
            companyId,
            scheduleId: defaultScheduleId,
            joinedDate: joined,
            ...(dateOfBirth !== undefined
              ? {
                  dateOfBirth: dateOfBirth
                    ? new Date(dateOfBirth + 'T00:00:00.000Z')
                    : null,
                }
              : {}),
            ...(confirmationDate !== undefined
              ? {
                  confirmationDate: confirmationDate
                    ? new Date(confirmationDate + 'T00:00:00.000Z')
                    : null,
                }
              : {}),
            ...(resignationDate !== undefined
              ? {
                  resignationDate: resignationDate
                    ? new Date(resignationDate + 'T00:00:00.000Z')
                    : null,
                }
              : {}),
            ...(overtimeHourlyRate !== undefined && overtimeHourlyRate !== null
              ? { overtimeHourlyRate: new Prisma.Decimal(overtimeHourlyRate) }
              : {}),
            ...(medicalLeaveEntitlement !== undefined &&
            medicalLeaveEntitlement !== null
              ? {
                  medicalLeaveEntitlement: new Prisma.Decimal(
                    medicalLeaveEntitlement,
                  ),
                }
              : {}),
          },
        });
        if (workingSchedule) {
          await tx.employeeWorkSchedule.create({
            data: {
              companyId,
              employeeId: employee.id,
              scheduleDays: {
                days: workingSchedule.days.map((day) => ({ ...day })),
              } as Prisma.InputJsonValue,
              effectiveFrom: joined,
            },
          });
        }
        if (basicSalary !== undefined && basicSalary !== null) {
          await tx.salaryHistory.create({
            data: {
              companyId,
              employeeId: employee.id,
              amount: new Prisma.Decimal(basicSalary),
              effectiveFrom: joined,
            },
          });
        }

        return { data: employee };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async update(companyId: string, id: string, dto: UpdateEmployeeDto) {
    const referencesChanged =
      dto.departmentId !== undefined ||
      dto.positionId !== undefined ||
      dto.managerId !== undefined ||
      dto.locationId !== undefined ||
      dto.scheduleId !== undefined;
    const current =
      referencesChanged ||
      dto.workingSchedule !== undefined ||
      dto.basicSalary !== undefined
        ? await this.db.employee.findUnique({
            where: { companyId_id: { companyId, id } },
            select: { departmentId: true, joinedDate: true },
          })
        : null;
    if (
      (referencesChanged ||
        dto.workingSchedule !== undefined ||
        dto.basicSalary !== undefined) &&
      !current
    )
      throw new NotFoundException();
    this.validateWorkingSchedule(dto.workingSchedule);
    const {
      joinedDate,
      dateOfBirth,
      confirmationDate,
      resignationDate,
      overtimeHourlyRate,
      medicalLeaveEntitlement,
      basicSalary,
      workingSchedule,
      ...rest
    } = dto;

    return this.db.$transaction(async (tx) => {
      await this.validateReferences(
        tx,
        companyId,
        dto,
        current?.departmentId,
        id,
      );
      const data = await tx.employee.update({
        where: { companyId_id: { companyId, id } },
        data: {
          ...rest,
          ...(joinedDate !== undefined
            ? {
                joinedDate: joinedDate
                  ? new Date(joinedDate + 'T00:00:00.000Z')
                  : undefined,
              }
            : {}),
          ...(dateOfBirth !== undefined
            ? {
                dateOfBirth: dateOfBirth
                  ? new Date(dateOfBirth + 'T00:00:00.000Z')
                  : null,
              }
            : {}),
          ...(confirmationDate !== undefined
            ? {
                confirmationDate: confirmationDate
                  ? new Date(confirmationDate + 'T00:00:00.000Z')
                  : null,
              }
            : {}),
          ...(resignationDate !== undefined
            ? {
                resignationDate: resignationDate
                  ? new Date(resignationDate + 'T00:00:00.000Z')
                  : null,
              }
            : {}),
          ...(overtimeHourlyRate !== undefined
            ? {
                overtimeHourlyRate:
                  overtimeHourlyRate !== null
                    ? new Prisma.Decimal(overtimeHourlyRate)
                    : null,
              }
            : {}),
          ...(medicalLeaveEntitlement !== undefined
            ? {
                medicalLeaveEntitlement:
                  medicalLeaveEntitlement !== null
                    ? new Prisma.Decimal(medicalLeaveEntitlement)
                    : null,
              }
            : {}),
        },
      });
      if (workingSchedule === null) {
        await tx.employeeWorkSchedule.deleteMany({
          where: { companyId, employeeId: id },
        });
      } else if (workingSchedule) {
        await tx.employeeWorkSchedule.upsert({
          where: { companyId_employeeId: { companyId, employeeId: id } },
          create: {
            companyId,
            employeeId: id,
            scheduleDays: {
              days: workingSchedule.days.map((day) => ({ ...day })),
            } as Prisma.InputJsonValue,
            effectiveFrom: current?.joinedDate ?? new Date(),
          },
          update: {
            scheduleDays: {
              days: workingSchedule.days.map((day) => ({ ...day })),
            } as Prisma.InputJsonValue,
            active: true,
          },
        });
      }
      if (basicSalary !== undefined && basicSalary !== null) {
        const latest = await tx.salaryHistory.findFirst({
          where: { companyId, employeeId: id },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (latest) {
          await tx.salaryHistory.update({
            where: { id: latest.id },
            data: { amount: new Prisma.Decimal(basicSalary) },
          });
        } else {
          await tx.salaryHistory.create({
            data: {
              companyId,
              employeeId: id,
              amount: new Prisma.Decimal(basicSalary),
              effectiveFrom: current?.joinedDate ?? new Date(),
            },
          });
        }
      }
      return { data };
    });
  }
  async salaries(companyId: string, id: string, q: PageDto) {
    await this.get(companyId, id);
    const where = { companyId, employeeId: id };
    const [data, total] = await this.db.$transaction([
      this.db.salaryHistory.findMany({
        where,
        orderBy: { effectiveFrom: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.salaryHistory.count({ where }),
    ]);
    return paginated(
      data.map((row) => ({ ...row, amount: row.amount.toFixed(2) })),
      total,
      q,
    );
  }
  async addSalary(companyId: string, id: string, dto: SalaryDto) {
    return this.db.$transaction(
      async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId, id } },
        });
        if (!employee) throw new NotFoundException();
        const from = new Date(dto.effectiveFrom + 'T00:00:00.000Z');
        if (from < employee.joinedDate)
          throw new UnprocessableEntityException(
            'Salary cannot start before employment.',
          );
        const latest = await tx.salaryHistory.findFirst({
          where: { companyId, employeeId: id },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (latest && from <= latest.effectiveFrom)
          throw new UnprocessableEntityException(
            'New salary must start after the latest salary record.',
          );
        const locked = await tx.payrollRun.count({
          where: {
            companyId,
            status: { not: 'DRAFT' },
            OR: [
              { year: { gt: from.getUTCFullYear() } },
              {
                year: from.getUTCFullYear(),
                month: { gte: from.getUTCMonth() + 1 },
              },
            ],
          },
        });
        if (locked)
          throw new ConflictException(
            'Salary changes cannot affect a calculated or finalized payroll period.',
          );
        // Intervals are [effectiveFrom, effectiveTo); the next salary begins at the previous end.
        if (latest)
          await tx.salaryHistory.update({
            where: { id: latest.id },
            data: { effectiveTo: from },
          });
        const row = await tx.salaryHistory.create({
          data: {
            companyId,
            employeeId: id,
            amount: dto.amount,
            effectiveFrom: from,
          },
        });
        return { data: { ...row, amount: row.amount.toFixed(2) } };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
