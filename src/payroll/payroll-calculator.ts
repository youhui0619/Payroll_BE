import {
  PayrollComponentDefinition,
  Prisma,
  StatutoryScheme,
} from '@prisma/client';
import { decimal, Result } from './calculator';
import { fail } from '../common/domain';

export interface PayrollComponent {
  code: string;
  kind: 'EARNING' | 'DEDUCTION';
  amount: string;
  affectsGross: boolean;
  affectsNet: boolean;
  statutoryBases: StatutoryScheme[];
  pcbTreatment?: string;
  source: { type: string; id: string };
  definition?: { id: string; revision: number; effectiveFrom: string };
}
export interface PayrollContribution {
  scheme: StatutoryScheme;
  rulesetId: string;
  version: string;
  result: Result;
}
const D = Prisma.Decimal;
export function componentFromDefinition(
  definition: PayrollComponentDefinition,
  amount: string,
  source: PayrollComponent['source'],
): PayrollComponent {
  if (!definition.active)
    fail(
      'COMPONENT_INACTIVE',
      'An archived component cannot be used for a new payroll calculation.',
    );
  if (definition.kind !== 'EARNING' && definition.kind !== 'DEDUCTION')
    fail('INVALID_COMPONENT_DEFINITION', 'Unknown component kind.');
  return {
    code: definition.code,
    kind: definition.kind,
    amount,
    affectsGross: definition.affectsGross,
    affectsNet: definition.affectsNet,
    statutoryBases: [...definition.statutoryBases],
    pcbTreatment: definition.pcbTreatment,
    source: { ...source },
    definition: {
      id: definition.id,
      revision: definition.revision,
      effectiveFrom: definition.effectiveFrom.toISOString().slice(0, 10),
    },
  };
}
function money(value: unknown, field: string) {
  const amount = decimal(value, field);
  if (amount.decimalPlaces() > 2)
    fail(
      'INVALID_PAYROLL_AMOUNT',
      field + ' must have at most two decimal places.',
      400,
    );
  return amount;
}

/** Pure wage-basis calculation. Inputs must be policy-resolved and snapshotted
 * by the orchestrator. For example, reimbursements need not affect gross/tax. */
export function payrollBases(components: readonly PayrollComponent[]) {
  if (!Array.isArray(components) || components.length > 1000)
    fail(
      'INVALID_PAYROLL_COMPONENTS',
      'Provide at most 1000 payroll components.',
      400,
    );
  let gross = new D(0),
    netBeforeStatutory = new D(0);
  let earnings = new D(0),
    deductions = new D(0);
  const bases = Object.fromEntries(
    Object.values(StatutoryScheme).map((s) => [s, new D(0)]),
  ) as Record<StatutoryScheme, Prisma.Decimal>;
  const sources = new Set<string>();
  const pcbRemuneration = {
    normal: new D(0),
    additional: new D(0),
    unclassified: new D(0),
  };
  const lines = components.map((item) => {
    if (
      !item ||
      !item.code?.trim() ||
      !['EARNING', 'DEDUCTION'].includes(item.kind) ||
      typeof item.affectsGross !== 'boolean' ||
      typeof item.affectsNet !== 'boolean' ||
      !item.source?.type ||
      !item.source?.id
    )
      fail(
        'INVALID_PAYROLL_COMPONENT',
        'A payroll component requires a code, kind, flags and source reference.',
        400,
      );
    if (
      !Array.isArray(item.statutoryBases) ||
      new Set(item.statutoryBases).size !== item.statutoryBases.length ||
      item.statutoryBases.some(
        (s) => !Object.values(StatutoryScheme).includes(s),
      )
    )
      fail(
        'INVALID_STATUTORY_BASIS',
        'Statutory basis flags must be unique supported schemes.',
        400,
      );
    const amount = money(item.amount, item.code);
    const sourceKey = JSON.stringify([item.source.type, item.source.id]);
    if (sources.has(sourceKey))
      fail(
        'DUPLICATE_PAYROLL_SOURCE',
        'The same payroll source cannot be included twice.',
        409,
      );
    sources.add(sourceKey);
    const signed = item.kind === 'EARNING' ? amount : amount.negated();
    if (item.statutoryBases.includes('PCB')) {
      const treatment = item.pcbTreatment ?? 'UNCLASSIFIED';
      if (!['NORMAL', 'ADDITIONAL', 'UNCLASSIFIED'].includes(treatment))
        fail(
          'INVALID_PCB_TREATMENT',
          'PCB-bearing lines require a remuneration classification.',
        );
      const key =
        treatment === 'NORMAL'
          ? 'normal'
          : treatment === 'ADDITIONAL'
            ? 'additional'
            : 'unclassified';
      pcbRemuneration[key] = pcbRemuneration[key].plus(signed);
    } else if (
      item.pcbTreatment &&
      ![
        'EXCLUDED',
        'EXCLUDED_NORMAL',
        'EXCLUDED_ADDITIONAL',
        'UNCLASSIFIED',
      ].includes(item.pcbTreatment)
    )
      fail(
        'INVALID_PCB_TREATMENT',
        'Normal/additional remuneration must affect the PCB wage basis.',
      );
    if (item.affectsGross) gross = gross.plus(signed);
    if (item.affectsNet) {
      netBeforeStatutory = netBeforeStatutory.plus(signed);
      if (item.kind === 'EARNING') earnings = earnings.plus(amount);
      else deductions = deductions.plus(amount);
    }
    for (const scheme of item.statutoryBases)
      bases[scheme] = bases[scheme].plus(signed);
    return {
      ...item,
      source: { ...item.source },
      ...(item.definition ? { definition: { ...item.definition } } : {}),
      statutoryBases: [...item.statutoryBases],
      amount: amount.toFixed(2),
      signedAmount: signed.toFixed(2),
    };
  });
  if (gross.lt(0) || Object.values(bases).some((b) => b.lt(0)))
    fail(
      'NEGATIVE_PAYROLL_BASIS',
      'Gross pay and statutory wage bases cannot be negative. Review deductions.',
    );
  if (Object.values(pcbRemuneration).some((v) => v.lt(0)))
    fail(
      'NEGATIVE_PCB_REMUNERATION',
      'Each remuneration category must remain non-negative after deductions.',
    );
  return {
    pcbRemuneration: {
      normal: pcbRemuneration.normal.toFixed(2),
      additional: pcbRemuneration.additional.toFixed(2),
      unclassified: pcbRemuneration.unclassified.toFixed(2),
    },
    gross: gross.toFixed(2),
    earnings: earnings.toFixed(2),
    componentDeductions: deductions.toFixed(2),
    netBeforeStatutory: netBeforeStatutory.toFixed(2),
    bases: Object.fromEntries(
      Object.entries(bases).map(([s, v]) => [s, v.toFixed(2)]),
    ) as Record<StatutoryScheme, string>,
    lines,
  };
}

/** Employer bears the remittance residual. Employee withholding remains the
 * calculated share. The signed adjustment is explicit in the immutable trace. */
export function payrollTotals(
  components: readonly PayrollComponent[],
  contributions: readonly PayrollContribution[],
) {
  const wage = payrollBases(components);
  if (
    !Array.isArray(contributions) ||
    contributions.some((c) => !c?.result) ||
    new Set(contributions.map((c) => c.scheme)).size !== contributions.length
  )
    fail(
      'DUPLICATE_STATUTORY_SCHEME',
      'Each statutory scheme may be calculated only once.',
      400,
    );
  let employeeTotal = new D(0),
    employerTotal = new D(0),
    roundingTotal = new D(0);
  const statutory = contributions.map((contribution) => {
    if (
      !Object.values(StatutoryScheme).includes(contribution.scheme) ||
      !contribution.rulesetId ||
      !contribution.version
    )
      fail(
        'INVALID_STATUTORY_REFERENCE',
        'A contribution requires a supported scheme and versioned ruleset reference.',
        400,
      );
    const result = contribution.result;
    if (
      money(result.basis, 'contribution basis').gt(
        wage.bases[contribution.scheme],
      )
    )
      fail(
        'STATUTORY_BASIS_MISMATCH',
        'A contribution basis exceeds the resolved wage basis.',
      );
    const employee = money(result.employee, 'employee contribution');
    const employer = money(result.employer, 'employer contribution');
    const adjustmentText = result.remittanceRounding ?? '0.00';
    if (!/^-?\d{1,14}(\.\d{1,2})?$/.test(adjustmentText))
      fail(
        'INVALID_ROUNDING_ADJUSTMENT',
        'Invalid remittance rounding amount.',
        400,
      );
    const adjustment = new D(adjustmentText);
    const remittance = employee.plus(employer).plus(adjustment);
    if (
      (result.total === undefined && !adjustment.isZero()) ||
      (result.total !== undefined &&
        !money(result.total, 'remittance total').equals(remittance)) ||
      employer.plus(adjustment).lt(0)
    )
      fail(
        'STATUTORY_TOTAL_MISMATCH',
        'Statutory shares and the remittance total do not reconcile.',
      );
    employeeTotal = employeeTotal.plus(employee);
    employerTotal = employerTotal.plus(employer).plus(adjustment);
    roundingTotal = roundingTotal.plus(adjustment);
    return {
      ...contribution,
      result: {
        ...result,
        trace: {
          ...structuredClone(result.trace),
          roundingAllocation: 'EMPLOYER',
        },
      },
      employeeDeduction: employee.toFixed(2),
      employerCost: employer.plus(adjustment).toFixed(2),
      remittance: remittance.toFixed(2),
      employerRounding: adjustment.toFixed(2),
    };
  });
  const net = new D(wage.netBeforeStatutory).minus(employeeTotal);
  if (net.lt(0))
    fail(
      'NEGATIVE_NET_PAY',
      'Deductions exceed payable earnings. Review or carry forward the excess.',
    );
  return {
    ...wage,
    deductions: new D(wage.componentDeductions).plus(employeeTotal).toFixed(2),
    employeeContributions: employeeTotal.toFixed(2),
    employerContributions: employerTotal.toFixed(2),
    employerRounding: roundingTotal.toFixed(2),
    net: net.toFixed(2),
    statutory,
  };
}
