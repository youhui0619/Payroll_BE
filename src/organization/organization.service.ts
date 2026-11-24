import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { paginated } from '../common/page.dto';
import {
  ACTIVE_STATUS_VALUES,
  makeStatusCounts,
} from '../common/status-summary';
import {
  CompanyDto,
  DepartmentQueryDto,
  DepartmentDto,
  PositionQueryDto,
  PositionDto,
  UpdateDepartmentDto,
  UpdatePositionDto,
} from './organization.dto';
import { FINANCIAL_MONTHS } from './organization.dto';

@Injectable()
export class OrganizationService {
  constructor(private db: Database) {}
  async company(companyId: string) {
    const data = await this.db.company.findUnique({ where: { id: companyId } });
    if (!data) throw new NotFoundException();
    return { data: this.companyView(data) };
  }
  async updateCompany(companyId: string, dto: CompanyDto) {
    const {
      financialStartingMonth,
      financialYearStartMonth,
      llpNumber,
      ...rest
    } = dto;
    const month =
      financialStartingMonth ??
      (financialYearStartMonth !== undefined
        ? FINANCIAL_MONTHS[financialYearStartMonth - 1]
        : undefined);
    if (
      financialYearStartMonth !== undefined &&
      (!month || financialYearStartMonth < 1 || financialYearStartMonth > 12)
    )
      throw new ConflictException('Invalid financial year start month.');
    const data = await this.db.company.update({
      where: { id: companyId },
      data: {
        ...rest,
        ...(llpNumber !== undefined ? { llpNo: llpNumber } : {}),
        ...(month
          ? {
              financialYearStartMonth: FINANCIAL_MONTHS.indexOf(month) + 1,
              financialStartingMonth: month,
            }
          : {}),
      },
    });
    return { data: this.companyView(data) };
  }
  private companyView<T extends { logo: string | null; llpNo: string | null }>(
    data: T,
  ) {
    return { ...data, logoUrl: data.logo, llpNumber: data.llpNo };
  }
  async departments(companyId: string, q: DepartmentQueryDto) {
    const baseFilters = [
      ...(q.search
        ? [
            {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' as const } },
                { code: { contains: q.search, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
      ...(q.parentDepartmentId
        ? [{ parentDepartmentId: q.parentDepartmentId }]
        : []),
    ];
    const baseWhere = {
      companyId,
      ...(baseFilters.length ? { AND: baseFilters } : {}),
    };
    const where = {
      ...baseWhere,
      ...(q.isActive !== undefined ? { active: q.isActive } : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.department.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { employees: true } } },
      }),
      this.db.department.count({ where }),
    ]);
    const data = rows.map(({ _count, ...row }) =>
      this.departmentView({ ...row, totalEmployees: _count.employees }),
    );
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((statusValue) =>
        this.db.department.count({
          where: { ...baseWhere, active: statusValue === 'ACTIVE' },
        }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES, statusCountValues),
      },
    });
  }
  async department(companyId: string, id: string) {
    const data = await this.db.department.findUnique({
      where: { companyId_id: { companyId, id } },
      include: {
        _count: { select: { employees: true, positions: true } },
        parentDepartment: {
          select: { id: true, code: true, name: true },
        },
        headOfDepartment: {
          select: { id: true, employeeNo: true, name: true },
        },
      },
    });
    if (!data) throw new NotFoundException();
    const { _count, ...department } = data;
    return {
      data: this.departmentView({
        ...department,
        totalEmployees: _count.employees,
        totalPositions: _count.positions,
      }),
    };
  }
  async createDepartment(companyId: string, dto: DepartmentDto) {
    const { effectiveFrom, effectiveTo, status, isActive, ...rest } = dto;
    const active =
      isActive ?? (status ? status.toUpperCase() !== 'INACTIVE' : true);
    const normalizedStatus = active ? 'ACTIVE' : 'INACTIVE';
    const data = await this.db.department.create({
      data: {
        ...rest,
        companyId,
        status: normalizedStatus,
        active: normalizedStatus !== 'INACTIVE',
        ...(effectiveFrom !== undefined
          ? {
              effectiveFrom: effectiveFrom
                ? new Date(effectiveFrom + 'T00:00:00.000Z')
                : null,
            }
          : {}),
        ...(effectiveTo !== undefined
          ? {
              effectiveTo: effectiveTo
                ? new Date(effectiveTo + 'T00:00:00.000Z')
                : null,
            }
          : {}),
      },
    });
    return { data: this.departmentView(data) };
  }
  async updateDepartment(
    companyId: string,
    id: string,
    dto: UpdateDepartmentDto,
  ) {
    const { effectiveFrom, effectiveTo, status, isActive, ...rest } = dto;
    const active =
      isActive ??
      (status !== undefined ? status.toUpperCase() !== 'INACTIVE' : undefined);
    const data = await this.db.department.update({
      where: { companyId_id: { companyId, id } },
      data: {
        ...rest,
        ...(active !== undefined
          ? {
              status: active ? 'ACTIVE' : 'INACTIVE',
              active,
            }
          : {}),
        ...(effectiveFrom !== undefined
          ? {
              effectiveFrom: effectiveFrom
                ? new Date(effectiveFrom + 'T00:00:00.000Z')
                : null,
            }
          : {}),
        ...(effectiveTo !== undefined
          ? {
              effectiveTo: effectiveTo
                ? new Date(effectiveTo + 'T00:00:00.000Z')
                : null,
            }
          : {}),
      },
    });
    return { data: this.departmentView(data) };
  }
  async positions(companyId: string, q: PositionQueryDto) {
    const baseWhere = {
      companyId,
      ...(q.search
        ? {
            OR: [
              { code: { contains: q.search, mode: 'insensitive' as const } },
              { title: { contains: q.search, mode: 'insensitive' as const } },
              {
                description: {
                  contains: q.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                reportsTo: {
                  contains: q.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.jobLevel ? { jobLevel: q.jobLevel } : {}),
    };
    const where = {
      ...baseWhere,
      ...(q.isActive !== undefined ? { active: q.isActive } : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.position.findMany({
        where,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          department: { select: { id: true, code: true, name: true } },
          _count: { select: { employees: true } },
        },
      }),
      this.db.position.count({ where }),
    ]);
    const data = rows.map(({ _count, ...row }) =>
      this.positionView({ ...row, employeeCount: _count.employees }),
    );
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.position.count({
          where: { ...baseWhere, active: status === 'ACTIVE' },
        }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES, statusCountValues),
      },
    });
  }
  async createPosition(companyId: string, dto: PositionDto) {
    return this.db.$transaction(
      async (tx) => {
        const { effectiveFrom, effectiveTo, status, departmentId, ...rest } =
          dto;
        if (departmentId) {
          const department = await tx.department.findUnique({
            where: { companyId_id: { companyId, id: departmentId } },
          });
          if (!department || !department.active)
            throw new NotFoundException('Active department not found.');
        }
        return {
          data: await tx.position.create({
            data: {
              ...rest,
              companyId,
              departmentId: departmentId ?? null,
              active: status !== 'INACTIVE',
              ...(effectiveFrom !== undefined
                ? {
                    effectiveFrom: effectiveFrom
                      ? new Date(effectiveFrom + 'T00:00:00.000Z')
                      : null,
                  }
                : {}),
              ...(effectiveTo !== undefined
                ? {
                    effectiveTo: effectiveTo
                      ? new Date(effectiveTo + 'T00:00:00.000Z')
                      : null,
                  }
                : {}),
            },
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async position(companyId: string, id: string) {
    const data = await this.db.position.findUnique({
      where: { companyId_id: { companyId, id } },
      include: {
        department: { select: { id: true, code: true, name: true } },
        _count: { select: { employees: true } },
      },
    });
    if (!data) throw new NotFoundException();
    const { _count, ...position } = data;
    return {
      data: this.positionView({ ...position, employeeCount: _count.employees }),
    };
  }
  async updatePosition(companyId: string, id: string, dto: UpdatePositionDto) {
    const { effectiveFrom, effectiveTo, status, departmentId, ...rest } = dto;
    const data = await this.db.position.update({
      where: { companyId_id: { companyId, id } },
      data: {
        ...rest,
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(status !== undefined ? { active: status !== 'INACTIVE' } : {}),
        ...(effectiveFrom !== undefined
          ? {
              effectiveFrom: effectiveFrom
                ? new Date(effectiveFrom + 'T00:00:00.000Z')
                : null,
            }
          : {}),
        ...(effectiveTo !== undefined
          ? {
              effectiveTo: effectiveTo
                ? new Date(effectiveTo + 'T00:00:00.000Z')
                : null,
            }
          : {}),
      },
    });
    return { data: this.positionView(data) };
  }
  async deactivate(
    companyId: string,
    id: string,
    kind: 'department' | 'position',
  ) {
    return this.db.$transaction(
      async (tx) => {
        const where = { companyId_id: { companyId, id } };
        const record =
          kind === 'department'
            ? await tx.department.findUnique({ where })
            : await tx.position.findUnique({ where });
        if (!record) throw new NotFoundException();
        const active = !record.active;
        if (!active) {
          const employees = await tx.employee.count({
            where: {
              companyId,
              active: true,
              ...(kind === 'department'
                ? { departmentId: id }
                : { positionId: id }),
            },
          });
          const positions =
            kind === 'department'
              ? await tx.position.count({
                  where: { companyId, departmentId: id, active: true },
                })
              : 0;
          if (employees || positions)
            throw new ConflictException(
              'Reassign active employees and deactivate dependent positions first.',
            );
        }
        const data =
          kind === 'department'
            ? await tx.department.update({
                where,
                data: { active, status: active ? 'ACTIVE' : 'INACTIVE' },
              })
            : await tx.position.update({ where, data: { active } });
        return {
          data:
            kind === 'position'
              ? this.positionView(data)
              : this.departmentView(data),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private departmentView<T extends object>(data: T) {
    if (data == null) return data as T;
    const { shortName, remark, ...view } = data as T & {
      shortName?: unknown;
      remark?: unknown;
    };
    void shortName;
    void remark;
    return view;
  }

  private positionView<T extends { active: boolean }>(data: T) {
    return { ...data, status: data.active ? 'ACTIVE' : 'INACTIVE' };
  }
}
