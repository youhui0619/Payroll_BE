import {
  Claim,
  CommissionPayrollRecord,
  PayrollComponentDefinition,
  PayrollInput,
  Prisma,
} from '@prisma/client';
import { fail } from '../common/domain';
import { componentFromDefinition, payrollBases } from './payroll-calculator';
import { calculateSalary } from './salary-calculator';

type OvertimeInput = {
  id: string;
  companyId: string;
  employeeId: string;
  status: string;
  overtimeDate: Date;
  netMinutes: number;
  hourlyRateMultiplier: Prisma.Decimal;
  earningCode: string;
};

type OvertimeSettings = {
  includeOvertime: boolean;
  standardWorkingHoursPerDay: Prisma.Decimal | null;
  salaryProrationMethod: string;
};

/** Resolved once per payroll transaction so previews and persisted runs share
 * the same FE-configured inclusion policy. */
export type PayrollInclusionSettings = {
  includeBasicSalary: boolean;
  includeOvertime: boolean;
  includeClaimsAndAllowance: boolean;
  includeBonus: boolean;
  includeCommissionAndIncentives: boolean;
  includeEpf: boolean;
  includeSocso: boolean;
  includeEis: boolean;
  includePcb: boolean;
  includeHrdCorpLevy: boolean;
  salaryProrationMethod: string;
};

export function calculateOvertimeAmount(input: {
  year: number;
  month: number;
  overtimeDate: Date;
  netMinutes: number;
  multiplier: Prisma.Decimal | string;
  basis: string | null;
  hourlyRate: Prisma.Decimal | string | null;
  standardWorkingHoursPerDay: Prisma.Decimal | string | null;
  salaryProrationMethod: string;
  salaries: readonly {
    amount: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }[];
}) {
  if (!Number.isInteger(input.netMinutes) || input.netMinutes <= 0)
    fail('INVALID_OVERTIME_DURATION', 'Overtime minutes must be positive.');
  const salary = input.salaries
    .filter((row) => {
      const from = new Date(row.effectiveFrom + 'T00:00:00.000Z');
      const to = row.effectiveTo
        ? new Date(row.effectiveTo + 'T00:00:00.000Z')
        : null;
      return from <= input.overtimeDate && (!to || input.overtimeDate < to);
    })
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (!salary)
    fail(
      'OVERTIME_SALARY_REQUIRED',
      'A salary effective on the overtime date is required.',
    );
  const D = Prisma.Decimal;
  let hourly: Prisma.Decimal;
  if (input.basis === 'HOURLY_RATE') {
    if (!input.hourlyRate || new D(input.hourlyRate).lte(0))
      fail(
        'OVERTIME_RATE_REQUIRED',
        'Configure a positive hourly overtime rate.',
      );
    hourly = new D(input.hourlyRate);
  } else {
    if (
      !input.standardWorkingHoursPerDay ||
      new D(input.standardWorkingHoursPerDay).lte(0)
    )
      fail(
        'OVERTIME_HOURS_REQUIRED',
        'Configure standard working hours before converting salary to an overtime rate.',
      );
    const denominator =
      input.salaryProrationMethod === 'FIXED_26_DAYS'
        ? 26
        : input.salaryProrationMethod === 'WORKING_DAYS'
          ? Array.from(
              {
                length: new Date(
                  Date.UTC(input.year, input.month, 0),
                ).getUTCDate(),
              },
              (_, day) =>
                new Date(
                  Date.UTC(input.year, input.month - 1, day + 1),
                ).getUTCDay(),
            ).filter((day) => day !== 0 && day !== 6).length
          : new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
    if (denominator <= 0)
      fail(
        'OVERTIME_PRORATION_INVALID',
        'Salary proration has no working days.',
      );
    hourly = new D(salary.amount)
      .div(denominator)
      .div(new D(input.standardWorkingHoursPerDay));
  }
  return hourly
    .mul(input.netMinutes)
    .div(60)
    .mul(input.multiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

export function assemblePayrollInputs(input: {
  companyId: string;
  runId: string;
  employeeId: string;
  salary: Parameters<typeof calculateSalary>[0];
  definitions: readonly PayrollComponentDefinition[];
  manualInputs: readonly PayrollInput[];
  claims?: readonly Claim[];
  commissions?: readonly CommissionPayrollRecord[];
  overtime?: readonly OvertimeInput[];
  employeeOvertime?: {
    includeOvertime: boolean;
    overtimeCalculationBasis: string | null;
    overtimeHourlyRate: Prisma.Decimal | null;
  };
  overtimeSettings?: OvertimeSettings | null;
  payrollSettings?: PayrollInclusionSettings | null;
}) {
  const month = new Date(
    Date.UTC(input.salary.year, input.salary.month - 1, 1),
  );
  const settings = input.payrollSettings;
  const salary = calculateSalary(input.salary);
  const definitions = new Map<string, PayrollComponentDefinition>();
  for (const definition of input.definitions) {
    if (definition.companyId !== input.companyId)
      fail(
        'PAYROLL_SOURCE_TENANT_MISMATCH',
        'Component definitions must belong to the payroll company.',
      );
    if (definition.effectiveFrom > month) continue;
    const previous = definitions.get(definition.code);
    if (!previous || definition.revision > previous.revision)
      definitions.set(definition.code, definition);
  }
  const resolve = (code: string) => {
    const definition = definitions.get(code);
    if (!definition?.active)
      fail(
        'COMPONENT_UNAVAILABLE',
        `Configure an active ${code} component for this payroll month.`,
      );
    return definition;
  };
  const basic =
    settings?.includeBasicSalary === false ? null : resolve('BASIC');
  if (basic?.statutoryBases.includes('PCB') && basic.pcbTreatment !== 'NORMAL')
    fail(
      'INVALID_BASIC_COMPONENT',
      'Basic salary must use normal PCB remuneration.',
    );
  if (
    basic &&
    (basic.kind !== 'EARNING' || !basic.affectsGross || !basic.affectsNet)
  )
    fail(
      'INVALID_BASIC_COMPONENT',
      'BASIC must be an earning affecting gross and net pay.',
    );
  const sourceId = input.runId + ':' + input.employeeId;
  const components = basic
    ? [
        componentFromDefinition(basic, salary.employedSalary, {
          type: 'SALARY',
          id: sourceId,
        }),
      ]
    : [];
  if (basic && new Prisma.Decimal(salary.unpaidDeduction).gt(0)) {
    const unpaid = resolve('UNPAID_LEAVE');
    if (
      unpaid.statutoryBases.includes('PCB') &&
      unpaid.pcbTreatment !== basic.pcbTreatment
    )
      fail(
        'INVALID_UNPAID_COMPONENT',
        'Unpaid salary deductions must use the same PCB remuneration class as BASIC.',
      );
    if (
      unpaid.kind !== 'DEDUCTION' ||
      !unpaid.affectsGross ||
      !unpaid.affectsNet ||
      [...unpaid.statutoryBases].sort().join(',') !==
        [...basic.statutoryBases].sort().join(',')
    )
      fail(
        'INVALID_UNPAID_COMPONENT',
        'UNPAID_LEAVE must deduct gross/net and the same statutory bases as BASIC.',
      );
    components.push(
      componentFromDefinition(unpaid, salary.unpaidDeduction, {
        type: 'UNPAID_LEAVE',
        id: sourceId,
      }),
    );
  }
  const manualSources: {
    id: string;
    reason: string;
    createdBy: string;
    createdAt: string;
  }[] = [];
  for (const row of input.manualInputs) {
    if (
      row.companyId !== input.companyId ||
      row.runId !== input.runId ||
      row.employeeId !== input.employeeId
    )
      fail(
        'PAYROLL_SOURCE_SCOPE_MISMATCH',
        'Manual inputs must belong to this company, run and employee.',
      );
    if (row.voidedAt) continue;
    if (['BASIC', 'UNPAID_LEAVE'].includes(row.componentCode))
      fail(
        'RESERVED_PAYROLL_COMPONENT',
        'BASIC and UNPAID_LEAVE are generated from salary and approved leave; use a separate adjustment code.',
      );
    if (row.componentCode === 'BONUS' && settings?.includeBonus === false)
      fail(
        'PAYROLL_COMPONENT_DISABLED',
        'Bonus is disabled in payroll settings; void the input or enable bonus processing.',
        409,
      );
    components.push(
      componentFromDefinition(
        resolve(row.componentCode),
        row.amount.toFixed(2),
        { type: 'MANUAL', id: row.id },
      ),
    );
    manualSources.push({
      id: row.id,
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    });
  }
  const claimSources: { id: string; description: string; date: string }[] = [];
  for (const claim of input.claims ?? []) {
    if (settings?.includeClaimsAndAllowance === false)
      fail(
        'PAYROLL_COMPONENT_DISABLED',
        'Claims and allowances are disabled in payroll settings; release the allocation or enable them.',
        409,
      );
    if (
      claim.companyId !== input.companyId ||
      claim.employeeId !== input.employeeId ||
      claim.payrollRunId !== input.runId ||
      claim.status !== 'APPROVED' ||
      claim.paymentMethod !== 'PAYROLL' ||
      !claim.payrollComponentCode
    )
      fail(
        'INVALID_PAYROLL_CLAIM',
        'Only approved claims allocated to this employee and run can be included.',
      );
    if (['BASIC', 'UNPAID_LEAVE'].includes(claim.payrollComponentCode))
      fail(
        'RESERVED_PAYROLL_COMPONENT',
        'Claims require a separate earning component.',
      );
    const definition = resolve(claim.payrollComponentCode);
    if (definition.kind !== 'EARNING' || !definition.affectsNet)
      fail(
        'INVALID_CLAIM_COMPONENT',
        'Claim component must be an earning affecting net pay.',
      );
    components.push(
      componentFromDefinition(definition, claim.amount.toFixed(2), {
        type: 'CLAIM',
        id: claim.id,
      }),
    );
    claimSources.push({
      id: claim.id,
      description: claim.description,
      date: claim.date.toISOString().slice(0, 10),
    });
  }
  const commissionSources: {
    id: string;
    planCode: string;
    planName: string | null;
    payrollEarningCode: string;
    amount: string;
    referenceId: string | null;
  }[] = [];
  for (const record of input.commissions ?? []) {
    if (settings?.includeCommissionAndIncentives === false)
      fail(
        'PAYROLL_COMPONENT_DISABLED',
        'Commission and incentives are disabled in payroll settings; release the allocation or enable them.',
        409,
      );
    if (
      record.companyId !== input.companyId ||
      record.employeeId !== input.employeeId ||
      record.payrollRunId !== input.runId ||
      record.status !== 'READY_FOR_PAYROLL'
    )
      fail(
        'INVALID_PAYROLL_COMMISSION',
        'Only ready commissions allocated to this employee and run can be included.',
      );
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
      ) ||
      month < earliest
    )
      fail(
        'COMMISSION_PERIOD_INELIGIBLE',
        'The saved commission payout timing does not permit this payroll month.',
      );
    if (['BASIC', 'UNPAID_LEAVE'].includes(record.payrollEarningCode))
      fail(
        'RESERVED_PAYROLL_COMPONENT',
        'Commissions require their own earning component.',
      );
    const definition = resolve(record.payrollEarningCode);
    if (
      definition.kind !== 'EARNING' ||
      !definition.affectsGross ||
      !definition.affectsNet
    )
      fail(
        'INVALID_COMMISSION_COMPONENT',
        'Commission must use an earning component affecting gross and net.',
      );
    components.push(
      componentFromDefinition(definition, record.amount.toFixed(2), {
        type: 'COMMISSION',
        id: record.id,
      }),
    );
    commissionSources.push({
      id: record.id,
      planCode: record.planCode,
      planName: record.planName,
      payrollEarningCode: record.payrollEarningCode,
      amount: record.amount.toFixed(2),
      referenceId: record.referenceId,
    });
  }
  const overtimeSources: {
    id: string;
    date: string;
    earningCode: string;
    minutes: number;
    amount: string;
    multiplier: string;
    calculationBasis: string;
  }[] = [];
  for (const request of input.overtime ?? []) {
    if (
      request.companyId !== input.companyId ||
      request.employeeId !== input.employeeId ||
      request.status !== 'APPROVED'
    )
      fail(
        'INVALID_PAYROLL_OVERTIME',
        'Only approved overtime allocated to this employee can be included.',
      );
    if (
      (input.overtimeSettings && !input.overtimeSettings.includeOvertime) ||
      settings?.includeOvertime === false
    )
      fail(
        'OVERTIME_DISABLED',
        'Overtime is disabled in payroll settings.',
        409,
      );
    if (!input.employeeOvertime?.includeOvertime)
      fail('OVERTIME_DISABLED', 'Overtime is disabled for this employee.', 409);
    const amount = calculateOvertimeAmount({
      year: input.salary.year,
      month: input.salary.month,
      overtimeDate: request.overtimeDate,
      netMinutes: request.netMinutes,
      multiplier: request.hourlyRateMultiplier,
      basis: input.employeeOvertime.overtimeCalculationBasis,
      hourlyRate: input.employeeOvertime.overtimeHourlyRate,
      standardWorkingHoursPerDay:
        input.overtimeSettings?.standardWorkingHoursPerDay ?? null,
      salaryProrationMethod:
        input.overtimeSettings?.salaryProrationMethod ?? 'FIXED_26_DAYS',
      salaries: input.salary.salaries,
    });
    const definition = resolve(request.earningCode);
    if (
      definition.kind !== 'EARNING' ||
      !definition.affectsGross ||
      !definition.affectsNet
    )
      fail(
        'INVALID_OVERTIME_COMPONENT',
        'Overtime must use an earning component affecting gross and net.',
      );
    components.push(
      componentFromDefinition(definition, amount, {
        type: 'OVERTIME',
        id: request.id,
      }),
    );
    overtimeSources.push({
      id: request.id,
      date: request.overtimeDate.toISOString().slice(0, 10),
      earningCode: request.earningCode,
      minutes: request.netMinutes,
      amount,
      multiplier: request.hourlyRateMultiplier.toFixed(2),
      calculationBasis:
        input.employeeOvertime.overtimeCalculationBasis ??
        'MONTHLY_SALARY_CONVERTED',
    });
  }
  return {
    ...payrollBases(components),
    salaryTrace: salary.trace,
    manualSources,
    claimSources,
    commissionSources,
    overtimeSources,
  };
}
