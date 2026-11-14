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
  async list(companyId: string, q: EmployeeQueryDto) {
    const search = q.search?.trim();
    const where = {
      companyId,
      ...(q.active !== undefined ? { active: q.active } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.positionId ? { positionId: q.positionId } : {}),
      ...(q.employmentStatus ? { employmentStatus: q.employmentStatus } : {}),
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
    const [rows, total] = await this.db.$transaction([
      this.db.employee.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          department: { select: { id: true, code: true, name: true } },
          position: { select: { id: true, code: true, title: true } },
          manager: { select: { id: true, employeeNo: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
          schedule: { select: { id: true, code: true, name: true } },
          salaries: {
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
        },
      }),
      this.db.employee.count({ where }),
    ]);
    const data = rows.map(({ salaries, ...employee }) => ({
      ...employee,
      currentSalary: salaries[0]
        ? {
            ...salaries[0],
            amount: salaries[0].amount.toFixed(2),
          }
        : null,
    }));
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
    const salaryHistory = data.salaries.map((salary) => ({
      ...salary,
      amount: salary.amount.toFixed(2),
    }));
    const currentSalary = salaryHistory[0] ?? null;
    return {
      data: {
        ...data,
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

        const {
          joinedDate,
          dateOfBirth,
          confirmationDate,
          resignationDate,
          overtimeHourlyRate,
          medicalLeaveEntitlement,
          ...rest
        } = dto;

        return {
          data: await tx.employee.create({
            data: {
              ...rest,
              companyId,
              joinedDate: new Date(joinedDate + 'T00:00:00.000Z'),
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
              ...(overtimeHourlyRate !== undefined &&
              overtimeHourlyRate !== null
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
          }),
        };
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
    const current = referencesChanged
      ? await this.db.employee.findUnique({
          where: { companyId_id: { companyId, id } },
          select: { departmentId: true },
        })
      : null;
    if (referencesChanged && !current) throw new NotFoundException();
    const {
      joinedDate,
      dateOfBirth,
      confirmationDate,
      resignationDate,
      overtimeHourlyRate,
      medicalLeaveEntitlement,
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
      return {
        data: await tx.employee.update({
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
        }),
      };
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
