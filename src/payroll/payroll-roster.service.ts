import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { fail } from '../common/domain';
import { paginated } from '../common/page.dto';
import { PayrollRosterQueryDto } from './payroll-roster.dto';

@Injectable()
export class PayrollRosterService {
  constructor(private db: Database) {}

  async list(m: Membership, runId: string, q: PayrollRosterQueryDto) {
    return this.db.$transaction(
      async (tx) => {
        const run = await tx.payrollRun.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
        });
        if (!run) throw new NotFoundException();
        if (run.status !== 'DRAFT')
          fail(
            'INVALID_STATE',
            'Live employee roster is available only for draft runs.',
            409,
          );
        const search = q.search?.trim();
        const where: Prisma.EmployeeWhereInput = {
          companyId: m.companyId,
          active: true,
          joinedDate: { lt: new Date(Date.UTC(run.year, run.month, 1)) },
          ...(q.departmentIds?.length
            ? { departmentId: { in: q.departmentIds } }
            : {}),
          ...(search
            ? {
                OR: [
                  { employeeNo: { contains: search, mode: 'insensitive' } },
                  { name: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        };
        const [employees, total] = await Promise.all([
          tx.employee.findMany({
            where,
            select: {
              id: true,
              employeeNo: true,
              name: true,
              department: { select: { id: true, name: true } },
              position: { select: { id: true, title: true } },
            },
            orderBy: [{ employeeNo: 'asc' }, { id: 'asc' }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          tx.employee.count({ where }),
        ]);
        return paginated(
          employees.map((employee) => ({
            employeeId: employee.id,
            employeeNo: employee.employeeNo,
            employee: employee.name,
            departmentId: employee.department?.id ?? null,
            department: employee.department?.name ?? null,
            positionId: employee.position?.id ?? null,
            position: employee.position?.title ?? null,
          })),
          total,
          q,
          {
            runId: run.id,
            year: run.year,
            month: run.month,
            runStatus: run.status,
            complete: false,
          },
        );
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
