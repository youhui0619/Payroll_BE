import { Prisma } from '@prisma/client';
import { fail } from '../common/domain';
const D = Prisma.Decimal;
export type Band = {
  lower: string;
  upper: string;
  employee: string;
  employer: string;
};
export type ContributionRules = {
  kind: 'TABLE' | 'RATE' | 'EXEMPT';
  bands?: Band[];
  ceiling?: string;
  employeeRate?: string;
  employerRate?: string;
  rounding?: 'CENTS' | 'WHOLE_UP' | 'TOTAL_WHOLE_UP';
  aboveTable?: {
    employeeRate: string;
    employerRate: string;
    rounding: 'CENTS' | 'WHOLE_UP' | 'TOTAL_WHOLE_UP';
  };
  reason?: string;
};
export type Result = {
  employee: string;
  employer: string;
  basis: string;
  trace: Record<string, unknown>;
  total?: string;
  remittanceRounding?: string;
};
export function decimal(value: unknown, label: string): Prisma.Decimal {
  if (typeof value !== 'string' || !/^\d{1,14}(\.\d{1,6})?$/.test(value))
    fail(
      'INVALID_CALCULATION_INPUT',
      label + ' must be a non-negative decimal string.',
      400,
    );
  return new D(value);
}
export function validateRules(raw: unknown): ContributionRules {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    fail('INVALID_RULESET', 'Rules must be an object.', 400);
  const p = raw as ContributionRules;
  if (!['TABLE', 'RATE', 'EXEMPT'].includes(p.kind))
    fail(
      'UNSUPPORTED_CALCULATOR',
      'This calculator only supports contribution tables, rates and explicit exemptions.',
      400,
    );
  if (p.ceiling !== undefined && decimal(p.ceiling, 'ceiling').lte(0))
    fail('INVALID_RULESET', 'Ceiling must be positive.', 400);
  if (
    p.kind === 'EXEMPT' &&
    (!p.reason || typeof p.reason !== 'string' || p.reason.length > 500)
  )
    fail('INVALID_RULESET', 'Exemption requires an explanation.', 400);
  if (p.kind === 'RATE') {
    for (const [name, value] of [
      ['employeeRate', p.employeeRate],
      ['employerRate', p.employerRate],
    ])
      if (decimal(value, name).gt(1))
        fail('INVALID_RULESET', 'Rates must be between zero and one.', 400);
    if (!['CENTS', 'WHOLE_UP', 'TOTAL_WHOLE_UP'].includes(p.rounding))
      fail('INVALID_RULESET', 'Specify contribution rounding.', 400);
  }
  if (p.kind === 'TABLE') {
    if (!Array.isArray(p.bands) || !p.bands.length || p.bands.length > 5000)
      fail('INVALID_RULESET', 'Provide 1 to 5000 bands.', 400);
    let previous = new D(0);
    for (const b of p.bands) {
      if (
        !b ||
        !decimal(b.lower, 'lower').equals(previous) ||
        decimal(b.upper, 'upper').lte(previous)
      )
        fail(
          'INVALID_RULESET',
          'Bands must be ordered, contiguous, and non-overlapping from zero.',
          400,
        );
      decimal(b.employee, 'employee');
      decimal(b.employer, 'employer');
      previous = new D(b.upper);
    }
    if (p.ceiling && new D(p.ceiling).gt(previous))
      fail('INVALID_RULESET', 'Table must cover the wage ceiling.', 400);
    if (p.aboveTable !== undefined) {
      if (
        !p.aboveTable ||
        typeof p.aboveTable !== 'object' ||
        Array.isArray(p.aboveTable) ||
        Object.keys(p.aboveTable).some(
          (key) => !['employeeRate', 'employerRate', 'rounding'].includes(key),
        )
      )
        fail(
          'INVALID_RULESET',
          'An above-table branch accepts only rates and rounding.',
          400,
        );
      if (p.ceiling)
        fail(
          'INVALID_RULESET',
          'A capped table cannot have an above-table rate branch.',
          400,
        );
      validateRules({ ...p.aboveTable, kind: 'RATE' });
    }
  }
  if (p.kind !== 'TABLE' && p.aboveTable)
    fail(
      'INVALID_RULESET',
      'An above-table branch requires a contribution table.',
      400,
    );
  return p;
}
export function calculateContribution(wages: string, raw: unknown): Result {
  const p = validateRules(raw);
  const wage = decimal(wages, 'wages');
  const basis = p.ceiling ? D.min(wage, p.ceiling) : wage;
  if (p.kind === 'EXEMPT')
    return {
      employee: '0.00',
      employer: '0.00',
      basis: basis.toFixed(2),
      trace: { kind: p.kind, reason: p.reason },
    };
  if (basis.isZero())
    return {
      employee: '0.00',
      employer: '0.00',
      basis: '0.00',
      ...(p.rounding === 'TOTAL_WHOLE_UP'
        ? { total: '0.00', remittanceRounding: '0.00' }
        : {}),
      trace: { kind: p.kind, zeroBasis: true },
    };
  if (p.kind === 'TABLE') {
    const last = p.bands[p.bands.length - 1];
    if (basis.gt(last.upper) && p.aboveTable) {
      const result = calculateContribution(wages, {
        ...p.aboveTable,
        kind: 'RATE',
      });
      return {
        ...result,
        trace: {
          ...result.trace,
          branch: 'ABOVE_TABLE',
          threshold: last.upper,
        },
      };
    }
    const index = p.bands.findIndex(
      (b) => basis.gt(b.lower) && basis.lte(b.upper),
    );
    if (index < 0)
      fail('STATUTORY_BAND_MISSING', 'No official band covers this wage.');
    const b = p.bands[index];
    return {
      employee: new D(b.employee).toFixed(2),
      employer: new D(b.employer).toFixed(2),
      basis: basis.toFixed(2),
      trace: { kind: p.kind, index, lower: b.lower, upper: b.upper },
    };
  }
  if (p.rounding === 'TOTAL_WHOLE_UP') {
    const rawEmployee = basis.mul(p.employeeRate);
    const rawEmployer = basis.mul(p.employerRate);
    const employee = rawEmployee.toDecimalPlaces(2, D.ROUND_HALF_UP);
    const employer = rawEmployer.toDecimalPlaces(2, D.ROUND_HALF_UP);
    const total = rawEmployee.plus(rawEmployer).ceil();
    const adjustment = total.minus(employee).minus(employer);
    return {
      employee: employee.toFixed(2),
      employer: employer.toFixed(2),
      basis: basis.toFixed(2),
      total: total.toFixed(2),
      remittanceRounding: adjustment.toFixed(2),
      trace: {
        kind: p.kind,
        employeeRate: p.employeeRate,
        employerRate: p.employerRate,
        rounding: p.rounding,
        rawEmployee: rawEmployee.toString(),
        rawEmployer: rawEmployer.toString(),
        roundingAllocation: 'UNALLOCATED',
      },
    };
  }
  const round = (v: Prisma.Decimal) =>
    p.rounding === 'WHOLE_UP'
      ? v.toDecimalPlaces(0, D.ROUND_CEIL).toFixed(2)
      : v.toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
  return {
    employee: round(basis.mul(p.employeeRate)),
    employer: round(basis.mul(p.employerRate)),
    basis: basis.toFixed(2),
    trace: {
      kind: p.kind,
      employeeRate: p.employeeRate,
      employerRate: p.employerRate,
      rounding: p.rounding,
    },
  };
}
