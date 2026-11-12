import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { ClaimAllocationReasonDto } from './claim-allocation.dto';

@Injectable()
export class ClaimAllocationService {
  constructor(private db: Database) {}
  async change(
    m: Membership,
    runId: string,
    claimId: string,
    d: ClaimAllocationReasonDto,
    componentCode?: string,
  ) {
    if (!d.reason.trim())
      fail('REASON_REQUIRED', 'Provide an allocation reason.', 400);
    if (componentCode && ['BASIC', 'UNPAID_LEAVE'].includes(componentCode))
      fail('RESERVED_PAYROLL_COMPONENT', 'Use a claim earning component.', 400);
    return this.db.$transaction(
      async (tx) => {
        const run = await tx.payrollRun.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
        });
        if (!run) throw new NotFoundException();
        if (run.status !== 'DRAFT')
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'Claim allocations can only change in draft runs.',
            409,
          );
        const claim = await tx.claim.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: claimId } },
          include: { employee: true },
        });
        if (!claim) throw new NotFoundException();
        if (claim.status !== 'APPROVED' || claim.paymentMethod !== 'PAYROLL')
          fail(
            'CLAIM_NOT_PAYROLL_READY',
            'Only approved unpaid PAYROLL claims may be allocated.',
            409,
          );
        if (claim.payrollRunId && claim.payrollRunId !== runId)
          fail(
            'CLAIM_ALREADY_ALLOCATED',
            'This claim belongs to another payroll run.',
            409,
          );
        const start = new Date(Date.UTC(run.year, run.month - 1, 1)),
          next = new Date(Date.UTC(run.year, run.month, 1));
        if (componentCode) {
          if (
            !claim.employee.active ||
            claim.employee.joinedDate >= next ||
            claim.date >= next
          )
            fail(
              'CLAIM_PERIOD_INELIGIBLE',
              'Employee and claim must be eligible by the end of this payroll period.',
            );
          const definition = await tx.payrollComponentDefinition.findFirst({
            where: {
              companyId: m.companyId,
              code: componentCode,
              effectiveFrom: { lte: start },
            },
            orderBy: { revision: 'desc' },
          });
          if (
            !definition?.active ||
            definition.kind !== 'EARNING' ||
            !definition.affectsNet
          )
            fail(
              'INVALID_CLAIM_COMPONENT',
              'Use an active earning component affecting net pay. Review gross/statutory flags for this claim.',
            );
          if (
            claim.payrollRunId === runId &&
            claim.payrollComponentCode === componentCode
          )
            return { data: { claimId, runId, componentCode } };
          const count = await tx.claim.count({
            where: {
              companyId: m.companyId,
              employeeId: claim.employeeId,
              payrollRunId: runId,
              id: { not: claimId },
            },
          });
          if (count >= 400)
            fail(
              'PAYROLL_INPUT_LIMIT',
              'An employee may have at most 400 claims in a payroll run.',
            );
        } else if (!claim.payrollRunId)
          return { data: { claimId, runId: null, componentCode: null } };
        await tx.claim.update({
          where: { companyId_id: { companyId: m.companyId, id: claimId } },
          data: {
            payrollRunId: componentCode ? runId : null,
            payrollComponentCode: componentCode ?? null,
          },
        });
        const action = componentCode
          ? 'CLAIM_PAYROLL_ALLOCATED'
          : 'CLAIM_PAYROLL_RELEASED';
        await tx.claimEvent.create({
          data: {
            companyId: m.companyId,
            claimId,
            actorId: m.userId,
            action,
            status: claim.status,
            comment: JSON.stringify({
              runId,
              componentCode: componentCode ?? null,
              previousComponentCode: claim.payrollComponentCode,
              reason: d.reason.trim(),
            }),
          },
        });
        await audit(tx, m, action, claimId);
        return {
          data: {
            claimId,
            runId: componentCode ? runId : null,
            componentCode: componentCode ?? null,
          },
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
