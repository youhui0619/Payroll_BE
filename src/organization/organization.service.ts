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
} from './organization.dto';

@Injectable()
export class OrganizationService {
  constructor(private db: Database) {}
  async company(companyId: string) {
    const data = await this.db.company.findUnique({ where: { id: companyId } });
    if (!data) throw new NotFoundException();
    return { data };
  }
  async updateCompany(companyId: string, dto: CompanyDto) {
    return {
      data: await this.db.company.update({
        where: { id: companyId },
        data: dto,
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
    return {
      data: await this.db.department.create({ data: { ...dto, companyId } }),
    };
  }
  async updateDepartment(
    companyId: string,
    id: string,
    dto: UpdateDepartmentDto,
  ) {
    return {
      data: await this.db.department.update({
        where: { companyId_id: { companyId, id } },
        data: dto,
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
        return {
          data: await tx.position.create({ data: { ...dto, companyId } }),
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
  async updatePosition(companyId: string, id: string, dto: { title?: string }) {
    return {
      data: await this.db.position.update({
        where: { companyId_id: { companyId, id } },
        data: dto,
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
