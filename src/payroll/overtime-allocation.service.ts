import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import { OvertimeAllocationDto } from './overtime-allocation.dto';

@Injectable()
export class OvertimeAllocationService {
  constructor(private db: Database) {}

  async change(
    m: Membership,
    runId: string,
    requestId: string,
    d: OvertimeAllocationDto,
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
            'Overtime allocations can only change in draft runs.',
            409,
          );
        const request = await tx.overtimeRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: requestId } },
          include: { employee: true },
        });
        if (!request) throw new NotFoundException();
        if (request.status !== 'APPROVED')
          fail(
            'OVERTIME_NOT_APPROVED',
            'Only approved overtime requests can be allocated to payroll.',
            409,
          );
        if (request.payrollRunId && request.payrollRunId !== runId)
          fail(
            'OVERTIME_ALREADY_ALLOCATED',
            'This overtime request belongs to another payroll run.',
            409,
          );

        const response = (allocated: boolean) => ({
          data: {
            requestId,
            runId: allocated ? runId : null,
            earningCode: request.earningCode,
            netMinutes: request.netMinutes,
            hourlyRateMultiplier: Number(request.hourlyRateMultiplier),
          },
        });
        if (allocate) {
          const start = new Date(Date.UTC(run.year, run.month - 1, 1));
          const next = new Date(Date.UTC(run.year, run.month, 1));
          if (
            request.overtimeDate < start ||
            request.overtimeDate >= next ||
            !request.employee.active ||
            request.employee.joinedDate >= next
          )
            fail(
              'OVERTIME_PERIOD_INELIGIBLE',
              'The overtime date and employee employment period must belong to this payroll month.',
            );
          const settings = await tx.payrollSettings.findUnique({
            where: { companyId: m.companyId },
          });
          if (settings && !settings.includeOvertime)
            fail(
              'OVERTIME_DISABLED',
              'Overtime is disabled in payroll settings.',
              409,
            );
          if (!request.employee.includeOvertime)
            fail(
              'OVERTIME_DISABLED',
              'Overtime is disabled for this employee.',
              409,
            );
          if (['BASIC', 'UNPAID_LEAVE'].includes(request.earningCode))
            fail(
              'RESERVED_PAYROLL_COMPONENT',
              'Overtime requires its own earning component.',
            );
          const definition = await tx.payrollComponentDefinition.findFirst({
            where: {
              companyId: m.companyId,
              code: request.earningCode,
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
              'INVALID_OVERTIME_COMPONENT',
              'Configure the overtime earning code to affect gross and net before allocation.',
            );
          if (request.payrollRunId === runId) return response(true);
          if (
            (await tx.overtimeRequest.count({
              where: {
                companyId: m.companyId,
                employeeId: request.employeeId,
                payrollRunId: runId,
              },
            })) >= 100
          )
            fail(
              'PAYROLL_INPUT_LIMIT',
              'At most 100 overtime requests per employee/run are supported.',
            );
        } else if (!request.payrollRunId) return response(false);

        await tx.overtimeRequest.update({
          where: { companyId_id: { companyId: m.companyId, id: requestId } },
          data: { payrollRunId: allocate ? runId : null },
        });
        const action = allocate ? 'ALLOCATED' : 'RELEASED';
        await tx.overtimeAllocationEvent.create({
          data: {
            companyId: m.companyId,
            requestId,
            runId,
            actorId: m.userId,
            action,
            reason: d.reason.trim(),
          },
        });
        await audit(tx, m, 'OVERTIME_PAYROLL_' + action, requestId);
        return response(allocate);
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async history(m: Membership, requestId: string, q: PageDto) {
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.overtimeRequest.findUnique({
            where: { companyId_id: { companyId: m.companyId, id: requestId } },
          }))
        )
          throw new NotFoundException();
        const where = { companyId: m.companyId, requestId };
        const [data, total] = await Promise.all([
          tx.overtimeAllocationEvent.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          tx.overtimeAllocationEvent.count({ where }),
        ]);
        return paginated(data, total, q);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
