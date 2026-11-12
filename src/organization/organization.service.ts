import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { PageDto, paginated } from '../common/page.dto';
import {
  CompanyDto,
  DepartmentDto,
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
    return { data };
  }
  async updateCompany(companyId: string, dto: CompanyDto) {
    const { financialStartingMonth, financialYearStartMonth, ...rest } = dto;
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
    return {
      data: await this.db.company.update({
        where: { id: companyId },
        data: {
          ...rest,
          ...(month
            ? {
                financialYearStartMonth: FINANCIAL_MONTHS.indexOf(month) + 1,
                financialStartingMonth: month,
              }
            : {}),
        },
      }),
    };
  }
  async departments(companyId: string, q: PageDto) {
    const where = {
      companyId,
      ...(q.search
        ? { name: { contains: q.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.department.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { employees: true } } },
      }),
      this.db.department.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async department(companyId: string, id: string) {
    const data = await this.db.department.findUnique({
      where: { companyId_id: { companyId, id } },
    });
    if (!data) throw new NotFoundException();
    return { data };
  }
  async createDepartment(companyId: string, dto: DepartmentDto) {
    const { effectiveFrom, effectiveTo, ...rest } = dto;
    return {
      data: await this.db.department.create({
        data: {
          ...rest,
          companyId,
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
  }
  async updateDepartment(
    companyId: string,
    id: string,
    dto: UpdateDepartmentDto,
  ) {
    const { effectiveFrom, effectiveTo, ...rest } = dto;
    return {
      data: await this.db.department.update({
        where: { companyId_id: { companyId, id } },
        data: {
          ...rest,
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
  }
  async positions(companyId: string, q: PageDto) {
    const where = {
      companyId,
      ...(q.search
        ? { title: { contains: q.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.position.findMany({
        where,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.position.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async createPosition(companyId: string, dto: PositionDto) {
    return this.db.$transaction(
      async (tx) => {
        const department = await tx.department.findUnique({
          where: { companyId_id: { companyId, id: dto.departmentId } },
        });
        if (!department || !department.active)
          throw new NotFoundException('Active department not found.');
        const { effectiveFrom, effectiveTo, ...rest } = dto;
        return {
          data: await tx.position.create({
            data: {
              ...rest,
              companyId,
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
    });
    if (!data) throw new NotFoundException();
    return { data };
  }
  async updatePosition(companyId: string, id: string, dto: UpdatePositionDto) {
    const { effectiveFrom, effectiveTo, ...rest } = dto;
    return {
      data: await this.db.position.update({
        where: { companyId_id: { companyId, id } },
        data: {
          ...rest,
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
        const data =
          kind === 'department'
            ? await tx.department.update({ where, data: { active: false } })
            : await tx.position.update({ where, data: { active: false } });
        return { data };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
