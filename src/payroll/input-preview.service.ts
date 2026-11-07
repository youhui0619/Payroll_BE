import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { fail } from '../common/domain';
import { assemblePayrollInputs } from './input-assembly';
import { resolveUnpaidDays } from './leave-inputs';
import { resolveContributions } from './contribution-resolver';
import { allocateEpfForPcb } from './epf-allocation';

@Injectable()
export class InputPreviewService {
  constructor(private db: Database) {}
  async preview(m: Membership, runId: string, employeeId: string) {
    return this.db.$transaction(
      async (tx) => {
        const run = await tx.payrollRun.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
        });
        if (!run) throw new NotFoundException();
        if (run.status !== 'DRAFT')
          fail(
            'INVALID_STATE',
            'Live input preview is available only for draft runs.',
            409,
          );
        const start = new Date(Date.UTC(run.year, run.month - 1, 1)),
          next = new Date(Date.UTC(run.year, run.month, 1));
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: employeeId } },
          include: {
            salaries: {
              where: {
                effectiveFrom: { lt: next },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
              },
            },
          },
        });
        if (!employee) throw new NotFoundException();
        if (!employee.active)
          fail(
            'EMPLOYEE_NOT_ELIGIBLE',
            'Inactive employees require employment-history resolution before payroll.',
          );
        const definitions = await tx.payrollComponentDefinition.findMany({
          where: { companyId: m.companyId, effectiveFrom: { lte: start } },
          distinct: ['code'],
          orderBy: [{ code: 'asc' }, { revision: 'desc' }],
        });
        const manualInputs = await tx.payrollInput.findMany({
          where: { companyId: m.companyId, runId, employeeId, voidedAt: null },
          orderBy: { id: 'asc' },
          take: 501,
        });
        if (manualInputs.length > 500)
          fail('PAYROLL_INPUT_LIMIT', 'Too many manual payroll inputs.');
        const leave = await tx.leaveRequest.findMany({
          where: {
            companyId: m.companyId,
            employeeId,
            paid: false,
            status: 'APPROVED',
            startDate: { lt: next },
            endDate: { gte: start },
          },
          take: 367,
        });
        if (leave.length > 366)
          fail('PAYROLL_INPUT_LIMIT', 'Too many overlapping leave inputs.');
        const claims = await tx.claim.findMany({
          where: { companyId: m.companyId, employeeId, payrollRunId: runId },
          orderBy: { id: 'asc' },
          take: 401,
        });
        if (claims.length > 400)
          fail('PAYROLL_INPUT_LIMIT', 'Too many allocated claims.');
        const result = assemblePayrollInputs({
          claims,
          companyId: m.companyId,
          runId,
          employeeId,
          definitions,
          manualInputs,
          salary: {
            year: run.year,
            month: run.month,
            joinedDate: employee.joinedDate.toISOString().slice(0, 10),
            salaries: employee.salaries.map((s) => ({
              id: s.id,
              amount: s.amount.toFixed(2),
              effectiveFrom: s.effectiveFrom.toISOString().slice(0, 10),
              effectiveTo: s.effectiveTo?.toISOString().slice(0, 10),
            })),
            unpaidDays: resolveUnpaidDays(leave, start, next),
          },
        });
        const profiles = await tx.employeePayrollProfileVersion.findMany({
          where: {
            companyId: m.companyId,
            employeeId,
            effectiveFrom: { lte: start },
          },
          orderBy: [{ effectiveFrom: 'desc' }, { revision: 'desc' }],
          take: 1,
        });
        const rulesets = await tx.statutoryRuleset.findMany({
          where: {
            companyId: m.companyId,
            active: true,
            scheme: { not: 'PCB' },
            effectiveFrom: { lt: next },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
          },
        });
        const contributionPreview = resolveContributions({
          companyId: m.companyId,
          employeeId,
          year: run.year,
          month: run.month,
          bases: result.bases,
          profiles,
          rulesets,
        });
        const taxOpening = await tx.employeeTaxOpening.findFirst({
          where: {
            companyId: m.companyId,
            employeeId,
            year: run.year,
            effectiveMonth: { lte: run.month },
          },
          orderBy: [{ effectiveMonth: 'desc' }, { revision: 'desc' }],
        });
        const taxFamily = await tx.employeeTaxFamily.findFirst({
          where: {
            companyId: m.companyId,
            employeeId,
            year: run.year,
            effectiveMonth: { lte: run.month },
          },
          orderBy: [{ effectiveMonth: 'desc' }, { revision: 'desc' }],
        });
        const taxExpenses = await tx.employeeTaxExpenses.findFirst({
          where: {
            companyId: m.companyId,
            employeeId,
            year: run.year,
            effectiveMonth: { lte: run.month },
          },
          orderBy: [{ effectiveMonth: 'desc' }, { revision: 'desc' }],
        });
        let epfAllocation: ReturnType<typeof allocateEpfForPcb> | null = null;
        let epfAllocationIssue: { code: string; message: string } | null = null;
        const epf = contributionPreview.contributions.find(
          (c) => c.scheme === 'EPF',
        );
        if (epf) {
          try {
            epfAllocation = allocateEpfForPcb(result.lines, epf.parameters);
          } catch (error) {
            if (!(error instanceof HttpException)) throw error;
            epfAllocationIssue = error.getResponse() as {
              code: string;
              message: string;
            };
          }
        } else
          epfAllocationIssue = {
            code: 'EPF_RULESET_REQUIRED',
            message:
              'Resolve EPF contribution rules before allocating its employee share.',
          };
        return {
          data: {
            runId,
            employeeId,
            ...result,
            contributionPreview,
            taxOpening,
            taxFamily,
            taxExpenses,
            epfAllocation,
            epfAllocationIssue,
            complete: false,
            limitations: [
              'Contribution preview excludes PCB. Final net pay is not calculated; profile eligibility still requires reviewed declarations.',
              'Unallocated claims, overtime and recurring allowances are not included.',
            ],
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
