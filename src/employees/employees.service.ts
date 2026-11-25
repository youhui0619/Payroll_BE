import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { audit, dateOnly, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
  SalaryDto,
  EmployeeLifecycleDto,
} from './employees.dto';
import { EmployeeImportDto, EmployeeImportRowDto } from './employee-import.dto';
import { EMPLOYMENT_STATUS_VALUES } from './employment-statuses';
import { WORKING_DAY_NAMES } from '../workforce/working-schedule.dto';
import {
  normalizeWorkingSchedule,
  toWorkingScheduleResponse,
} from '../workforce/working-schedule.mapper';
import { makeStatusCounts } from '../common/status-summary';
import { csv } from '../reports/reports.utils';

@Injectable()
export class EmployeesService {
  constructor(private db: Database) {}

  private employeePresentation<T extends { employeeNo: string; name: string }>(
    row: T,
  ) {
    // const initials = row.name
    //   .trim()
    //   .split(/\s+/)
    //   .filter(Boolean)
    //   .slice(0, 2)
    //   .map((part) => part[0]?.toUpperCase() ?? '')
    //   .join('');
    return {
      ...row,
    };
  }
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

  private normalizeImportRow(row: EmployeeImportRowDto) {
    return {
      ...row,
      employeeNo: row.employeeNo?.trim(),
      name: row.name?.trim(),
      email: row.email?.trim() || null,
      joinedDate: row.joinedDate?.trim(),
      salaryType: row.salaryType?.trim() || null,
      paymentMethod: row.paymentMethod?.trim() || null,
      bank: row.bank?.trim() || null,
      bankAccount: row.bankAccount?.trim() || null,
    };
  }

  private async validateImportRows(
    tx: Prisma.TransactionClient,
    companyId: string,
    rows: EmployeeImportRowDto[],
  ) {
    const normalized = rows.map((row) => this.normalizeImportRow(row));
    const employeeNos = normalized
      .map((row) => row.employeeNo)
      .filter((value): value is string => !!value);
    const existing = await tx.employee.findMany({
      where: { companyId, employeeNo: { in: employeeNos } },
      select: { employeeNo: true },
    });
    const existingNos = new Set(existing.map((row) => row.employeeNo));
    const seen = new Set<string>();
    return Promise.all(
      normalized.map(async (row, index) => {
        const errors: string[] = [];
        if (!row.employeeNo) errors.push('Employee number is required.');
        if (!row.name) errors.push('Name is required.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.joinedDate ?? ''))
          errors.push('Joined date must use YYYY-MM-DD.');
        else if (
          Number.isNaN(new Date(`${row.joinedDate}T00:00:00.000Z`).getTime())
        )
          errors.push('Joined date is invalid.');
        if (row.employeeNo && seen.has(row.employeeNo))
          errors.push('Employee number is duplicated in this import.');
        if (row.employeeNo) seen.add(row.employeeNo);
        if (row.employeeNo && existingNos.has(row.employeeNo))
          errors.push('Employee number already exists.');
        try {
          if (!errors.length) await this.validateReferences(tx, companyId, row);
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : 'Invalid reference.',
          );
        }
        return {
          rowNumber: index + 1,
          employeeNo: row.employeeNo ?? '',
          valid: errors.length === 0,
          errors,
          normalized: row,
        };
      }),
    );
  }

  async importPreview(companyId: string, dto: EmployeeImportDto) {
    return this.db.$transaction(async (tx) => {
      const rows = await this.validateImportRows(tx, companyId, dto.rows);
      return {
        data: {
          entityType: 'EMPLOYEE',
          rowCount: rows.length,
          validCount: rows.filter((row) => row.valid).length,
          errorCount: rows.filter((row) => !row.valid).length,
          canCommit: rows.every((row) => row.valid),
          rows,
        },
      };
    });
  }

  async importCommit(m: Membership, dto: EmployeeImportDto) {
    return this.db.$transaction(
      async (tx) => {
        const entityType = 'EMPLOYEE';
        const existingBatch = await tx.importBatch.findUnique({
          where: {
            companyId_entityType_idempotencyKey: {
              companyId: m.companyId,
              entityType,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (existingBatch)
          return { data: existingBatch.summary, idempotent: true };
        const rows = await this.validateImportRows(tx, m.companyId, dto.rows);
        if (rows.some((row) => !row.valid))
          fail(
            'IMPORT_VALIDATION_FAILED',
            'Resolve all row errors in the import preview before committing.',
            422,
          );
        const created: { id: string; employeeNo: string }[] = [];
        for (const row of rows) {
          const value = row.normalized;
          const joinedDate = new Date(`${value.joinedDate}T00:00:00.000Z`);
          const scheduleId =
            value.scheduleId !== undefined
              ? value.scheduleId
              : await this.defaultScheduleId(
                  tx,
                  m.companyId,
                  value.employmentType,
                );
          const employee = await tx.employee.create({
            data: {
              companyId: m.companyId,
              employeeNo: value.employeeNo,
              name: value.name,
              email: value.email,
              joinedDate,
              departmentId: value.departmentId ?? null,
              positionId: value.positionId ?? null,
              managerId: value.managerId ?? null,
              locationId: value.locationId ?? null,
              scheduleId,
              employmentType: value.employmentType ?? null,
              salaryType: value.salaryType,
              paymentMethod: value.paymentMethod,
              bank: value.bank,
              bankAccount: value.bankAccount,
            },
          });
          if (value.basicSalary !== undefined && value.basicSalary !== null)
            await tx.salaryHistory.create({
              data: {
                companyId: m.companyId,
                employeeId: employee.id,
                amount: new Prisma.Decimal(value.basicSalary),
                effectiveFrom: joinedDate,
              },
            });
          created.push({ id: employee.id, employeeNo: employee.employeeNo });
        }
        const summary = {
          entityType,
          rowCount: rows.length,
          validCount: rows.length,
          errorCount: 0,
          created,
        };
        const storedSummary = JSON.parse(
          JSON.stringify(summary),
        ) as Prisma.InputJsonValue;
        const batch = await tx.importBatch.create({
          data: {
            companyId: m.companyId,
            actorId: m.userId,
            entityType,
            idempotencyKey: dto.idempotencyKey,
            rowCount: rows.length,
            createdCount: created.length,
            errorCount: 0,
            summary: storedSummary,
          },
        });
        await audit(tx, m, 'EMPLOYEE_IMPORT_COMMITTED', batch.id, {
          entityType,
          idempotencyKey: dto.idempotencyKey,
          rowCount: rows.length,
        });
        return { data: summary, idempotent: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
    return paginated(
      rows.map((row) => this.employeePresentation(row)),
      total,
      q,
      {
        summary: { statusCounts },
      },
    );
  }

  async exportCsv(m: Membership, q: EmployeeQueryDto) {
    const search = q.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      companyId: m.companyId,
      ...(q.active !== undefined ? { active: q.active } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.positionId ? { positionId: q.positionId } : {}),
      ...(q.employmentType ? { employmentType: q.employmentType } : {}),
      ...(q.employmentStatus ? { employmentStatus: q.employmentStatus } : {}),
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
    const rows = await this.db.employee.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 5001,
      select: {
        employeeNo: true,
        name: true,
        email: true,
        active: true,
        joinedDate: true,
        employmentStatus: true,
        employmentType: true,
        department: { select: { code: true, name: true } },
        position: { select: { code: true, title: true } },
        manager: { select: { employeeNo: true, name: true } },
        location: { select: { code: true, name: true } },
      },
    });
    if (rows.length > 5000)
      fail(
        'EXPORT_TOO_LARGE',
        'Narrow the employee filters before exporting.',
        400,
      );
    await audit(this.db, m, 'EMPLOYEES_EXPORTED', m.companyId, {
      search: q.search ?? null,
      active: q.active ?? null,
      departmentId: q.departmentId ?? null,
      positionId: q.positionId ?? null,
      employmentStatus: q.employmentStatus ?? null,
      employmentType: q.employmentType ?? null,
      rowCount: rows.length,
    });
    return csv(
      [
        'Employee number',
        'Name',
        'Email',
        'Active',
        'Joined date',
        'Employment status',
        'Employment type',
        'Department code',
        'Department',
        'Position code',
        'Position',
        'Manager employee number',
        'Manager',
        'Location code',
        'Location',
      ],
      rows.map((row) => [
        row.employeeNo,
        row.name,
        row.email ?? '',
        row.active,
        row.joinedDate.toISOString().slice(0, 10),
        row.employmentStatus ?? '',
        row.employmentType ?? '',
        row.department?.code ?? '',
        row.department?.name ?? '',
        row.position?.code ?? '',
        row.position?.title ?? '',
        row.manager?.employeeNo ?? '',
        row.manager?.name ?? '',
        row.location?.code ?? '',
        row.location?.name ?? '',
      ]),
    );
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
    const statusCountValues = await Promise.all(
      EMPLOYMENT_STATUS_VALUES.map((status) =>
        this.db.employee.count({
          where: { ...where, employmentStatus: status },
        }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(
          EMPLOYMENT_STATUS_VALUES,
          statusCountValues,
        ),
      },
    });
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
    const { employeeWorkSchedule, schedule, ...employee } = data;
    const salaries = data.salaries.map((salary) => ({
      ...salary,
      amount: salary.amount.toFixed(2),
    }));
    const currentSalary = salaries[0] ?? null;
    const masterSchedule = schedule
      ? toWorkingScheduleResponse(schedule)
      : null;
    return {
      data: {
        ...this.employeePresentation(employee),
        overtimeHourlyRate: employee.overtimeHourlyRate?.toNumber() ?? null,
        medicalLeaveEntitlement:
          employee.medicalLeaveEntitlement?.toNumber() ?? null,
        schedule: masterSchedule,
        workingSchedule: normalizeWorkingSchedule(
          employeeWorkSchedule?.scheduleDays ?? schedule?.scheduleDays,
        ),
        basicSalary: currentSalary?.amount ?? null,
        salaries,
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

  async lifecycle(
    m: Membership,
    id: string,
    action: 'ACTIVATE' | 'CONFIRM' | 'RESIGN' | 'TERMINATE' | 'ARCHIVE',
    dto: EmployeeLifecycleDto,
  ) {
    const effectiveDate = dateOnly(
      dto.effectiveDate ?? new Date().toISOString().slice(0, 10),
    );
    return this.db.$transaction(
      async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!employee) throw new NotFoundException('Employee not found.');
        if (effectiveDate < employee.joinedDate)
          fail(
            'LIFECYCLE_DATE_BEFORE_JOINING',
            'The lifecycle effective date cannot precede the joining date.',
            422,
          );
        if (
          (action === 'RESIGN' ||
            action === 'TERMINATE' ||
            action === 'ARCHIVE') &&
          !dto.reason?.trim()
        )
          fail(
            'LIFECYCLE_REASON_REQUIRED',
            'A reason is required for this employee lifecycle command.',
            400,
          );
        if (
          action === 'ACTIVATE' &&
          ['RESIGNED', 'TERMINATED', 'RETIRED'].includes(
            employee.employmentStatus ?? '',
          )
        )
          fail(
            'INVALID_LIFECYCLE_TRANSITION',
            'A resigned, terminated or retired employee cannot be activated directly.',
            409,
          );
        if (action === 'CONFIRM' && !employee.active)
          fail(
            'INVALID_LIFECYCLE_TRANSITION',
            'Only an active employee can be confirmed.',
            409,
          );
        if ((action === 'RESIGN' || action === 'TERMINATE') && !employee.active)
          fail(
            'INVALID_LIFECYCLE_TRANSITION',
            'Only an active employee can be resigned or terminated.',
            409,
          );
        const locked = await tx.payrollRun.count({
          where: {
            companyId: m.companyId,
            status: { not: 'DRAFT' },
            OR: [
              { year: { gt: effectiveDate.getUTCFullYear() } },
              {
                year: effectiveDate.getUTCFullYear(),
                month: { gte: effectiveDate.getUTCMonth() + 1 },
              },
            ],
          },
        });
        if (locked)
          fail(
            'EMPLOYEE_LIFECYCLE_LOCKED',
            'The employee status cannot change for a period with calculated or finalized payroll.',
            409,
          );
        const statusByAction = {
          ACTIVATE: 'ACTIVE',
          CONFIRM: 'ACTIVE',
          RESIGN: 'RESIGNED',
          TERMINATE: 'TERMINATED',
          ARCHIVE: employee.employmentStatus ?? 'ACTIVE',
        } as const;
        const active = action === 'ACTIVATE' || action === 'CONFIRM';
        const data = await tx.employee.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: {
            active,
            employmentStatus: statusByAction[action],
            ...(action === 'CONFIRM'
              ? { confirmationDate: effectiveDate }
              : {}),
            ...(action === 'ACTIVATE'
              ? { resignationDate: null }
              : action === 'RESIGN' || action === 'TERMINATE'
                ? { resignationDate: effectiveDate }
                : {}),
          },
        });
        await audit(tx, m, `EMPLOYEE_${action}`, id, {
          effectiveDate: effectiveDate.toISOString().slice(0, 10),
          reason: dto.reason?.trim() ?? null,
          previousStatus: employee.employmentStatus,
          previousActive: employee.active,
          status: data.employmentStatus,
          active: data.active,
        });
        return { data };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
