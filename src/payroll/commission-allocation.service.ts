import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import { CommissionAllocationDto } from './commission-allocation.dto';

@Injectable()
export class CommissionAllocationService {
  constructor(private db: Database) {}
  async change(
    m: Membership,
    runId: string,
    recordId: string,
    d: CommissionAllocationDto,
    allocate: boolean,
  ) {
    if (!d.reason.trim())
      fail('REASON_REQUIRED', 'Provide an allocation reason.', 400);
    return this.db.$transaction(
      async (tx) => {
        const run = await tx.payrollRun.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
        });
        if (!run) throw new NotFoundException();
        if (run.status !== 'DRAFT')
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'Commission allocations can only change in draft runs.',
            409,
          );
        const record = await tx.commissionPayrollRecord.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: recordId } },
          include: { employee: true },
        });
        if (!record) throw new NotFoundException();
        if (record.status !== 'READY_FOR_PAYROLL')
          fail(
            'COMMISSION_NOT_PAYROLL_READY',
            'Only ready-for-payroll commission records can be allocated or released.',
            409,
          );
        if (record.payrollRunId && record.payrollRunId !== runId)
          fail(
            'COMMISSION_ALREADY_ALLOCATED',
            'This commission belongs to another payroll run.',
            409,
          );
        const response = (allocated: boolean) => ({
          data: {
            recordId,
            runId: allocated ? runId : null,
            componentCode: record.payrollEarningCode,
          },
        });
        if (allocate) {
          const start = new Date(Date.UTC(run.year, run.month - 1, 1));
          const next = new Date(Date.UTC(run.year, run.month, 1));
          const earliest = new Date(
            Date.UTC(
              record.createdDate.getUTCFullYear(),
              record.createdDate.getUTCMonth() +
                (record.payoutTiming === 'NEXT_PAYROLL' ? 1 : 0),
              1,
            ),
          );
          if (
            !['CURRENT_PAYROLL', 'NEXT_PAYROLL'].includes(
              record.payoutTiming ?? '',
            )
          )
            fail(
              'COMMISSION_PAYOUT_UNSUPPORTED',
              'Separate or unclassified payouts cannot be included in monthly payroll. Review the record payout timing.',
              409,
            );
          if (
            !record.employee.active ||
            record.employee.joinedDate >= next ||
            start < earliest
          )
            fail(
              'COMMISSION_PERIOD_INELIGIBLE',
              'Employee and commission payout timing must be eligible for this payroll month.',
            );
          if (['BASIC', 'UNPAID_LEAVE'].includes(record.payrollEarningCode))
            fail(
              'RESERVED_PAYROLL_COMPONENT',
              'Commission requires its own earning component.',
            );
          const definition = await tx.payrollComponentDefinition.findFirst({
            where: {
              companyId: m.companyId,
              code: record.payrollEarningCode,
              effectiveFrom: { lte: start },
            },
            orderBy: { revision: 'desc' },
          });
          if (
            !definition?.active ||
            definition.kind !== 'EARNING' ||
            !definition.affectsGross ||
            !definition.affectsNet
          )
            fail(
              'INVALID_COMMISSION_COMPONENT',
              'Configure the commission earning code to affect gross and net, with reviewed statutory flags.',
            );
          if (record.payrollRunId === runId) return response(true);
          if (
            (await tx.commissionPayrollRecord.count({
              where: {
                companyId: m.companyId,
                employeeId: record.employeeId,
                payrollRunId: runId,
              },
            })) >= 100
          )
            fail(
              'PAYROLL_INPUT_LIMIT',
              'At most 100 commission records per employee/run are supported.',
            );
        } else if (!record.payrollRunId) return response(false);
        await tx.commissionPayrollRecord.update({
          where: { companyId_id: { companyId: m.companyId, id: recordId } },
          data: { payrollRunId: allocate ? runId : null },
        });
        const action = allocate ? 'ALLOCATED' : 'RELEASED';
        await tx.commissionAllocationEvent.create({
          data: {
            companyId: m.companyId,
            recordId,
            runId,
            actorId: m.userId,
            action,
            reason: d.reason.trim(),
          },
        });
        await audit(tx, m, 'COMMISSION_PAYROLL_' + action, recordId);
        return response(allocate);
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async history(m: Membership, recordId: string, q: PageDto) {
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.commissionPayrollRecord.findUnique({
            where: { companyId_id: { companyId: m.companyId, id: recordId } },
          }))
        )
          throw new NotFoundException();
        const where = { companyId: m.companyId, recordId };
        const [data, total] = await Promise.all([
          tx.commissionAllocationEvent.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          tx.commissionAllocationEvent.count({ where }),
        ]);
        return paginated(data, total, q);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
