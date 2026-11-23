import { Prisma } from '@prisma/client';
import { fail } from '../common/domain';
import { decimal } from './calculator';

const DAY = 86400000;
const SOURCE =
  'https://www.investmalaysia.gov.my/media/felj30g0/employment-act-1955.pdf';
export interface SalarySegment {
  id: string;
  amount: string;
  effectiveFrom: string;
  /** Exclusive, matching SalaryHistory. */
  effectiveTo?: string | null;
}
export interface UnpaidDay {
  date: string;
  days: '0.5' | '1';
  sourceId: string;
}
function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail('INVALID_SALARY_DATE', 'Salary dates must use YYYY-MM-DD.', 400);
  const result = new Date(value + 'T00:00:00.000Z');
  if (
    !Number.isFinite(result.getTime()) ||
    result.toISOString().slice(0, 10) !== value
  )
    fail('INVALID_SALARY_DATE', 'Invalid salary calendar date.', 400);
  return result.getTime();
}
const iso = (day: number) => new Date(day).toISOString().slice(0, 10);

/** Calendar-month wages. Unpaid dates must already be resolved from approved,
 * frozen leave facts; this function does not infer attendance or leave policy. */
export function calculateSalary(input: {
  year: number;
  month: number;
  joinedDate: string;
  lastEmploymentDate?: string;
  prorationMethod?: 'CALENDAR_DAYS' | 'FIXED_26_DAYS' | 'WORKING_DAYS';
  salaries: readonly SalarySegment[];
  unpaidDays?: readonly UnpaidDay[];
}) {
  if (
    !Number.isInteger(input.year) ||
    input.year < 2000 ||
    input.year > 2200 ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  )
    fail('INVALID_SALARY_PERIOD', 'Invalid salary month.', 400);
  if (
    !Array.isArray(input.salaries) ||
    input.salaries.length > 1000 ||
    (input.unpaidDays &&
      (!Array.isArray(input.unpaidDays) || input.unpaidDays.length > 62))
  )
    fail(
      'INVALID_SALARY_INPUT',
      'Salary or unpaid-day input limit exceeded.',
      400,
    );
  const start = Date.UTC(input.year, input.month - 1, 1);
  const next = Date.UTC(input.year, input.month, 1);
  const joined = date(input.joinedDate);
  const last = input.lastEmploymentDate ? date(input.lastEmploymentDate) : null;
  if (last !== null && last < joined)
    fail(
      'INVALID_EMPLOYMENT_DATES',
      'Last employment day precedes joining.',
      400,
    );
  const from = Math.max(start, joined);
  const to = Math.min(next, last === null ? next : last + DAY);
  if (from >= to)
    fail(
      'EMPLOYEE_NOT_ELIGIBLE',
      'Employment does not overlap this salary month.',
    );
  const method = input.prorationMethod ?? 'CALENDAR_DAYS';
  if (!['CALENDAR_DAYS', 'FIXED_26_DAYS', 'WORKING_DAYS'].includes(method))
    fail(
      'INVALID_SALARY_PRORATION',
      'Unsupported salary proration method.',
      400,
    );
  const calendarDays = (next - start) / DAY;
  const workingDays = Array.from({ length: calendarDays }, (_, index) => {
    const weekday = new Date(start + index * DAY).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  }).filter(Boolean).length;
  const divisor =
    method === 'FIXED_26_DAYS'
      ? 26
      : method === 'WORKING_DAYS'
        ? workingDays
        : calendarDays;
  if (divisor <= 0)
    fail(
      'INVALID_SALARY_PRORATION',
      'Salary proration has no basis days.',
      400,
    );
  const ids = new Set<string>();
  const salaries = input.salaries.map((s) => {
    if (!s.id || ids.has(s.id))
      fail(
        'DUPLICATE_SALARY_SOURCE',
        'Salary source IDs must be present and unique.',
        400,
      );
    ids.add(s.id);
    const amount = decimal(s.amount, 'monthly salary');
    if (amount.decimalPlaces() > 2 || amount.gte('1000000000000'))
      fail(
        'INVALID_SALARY_AMOUNT',
        'Monthly salary must fit a currency amount.',
        400,
      );
    const begin = date(s.effectiveFrom),
      end = s.effectiveTo ? date(s.effectiveTo) : Infinity;
    if (end <= begin)
      fail(
        'INVALID_SALARY_INTERVAL',
        'Salary end is exclusive and must follow its start.',
        400,
      );
    return { id: s.id, amount, begin, end };
  });
  const unpaid = new Map<
    number,
    { days: Prisma.Decimal; sources: UnpaidDay[] }
  >();
  const unpaidKeys = new Set<string>();
  for (const entry of input.unpaidDays ?? []) {
    const day = date(entry.date);
    if (
      day < from ||
      day >= to ||
      !entry.sourceId ||
      !['0.5', '1'].includes(entry.days)
    )
      fail(
        'INVALID_UNPAID_DAY',
        'Unpaid days must be within employed days and use half or whole days with a source.',
        400,
      );
    const key = JSON.stringify([entry.date, entry.sourceId]);
    if (unpaidKeys.has(key))
      fail(
        'DUPLICATE_UNPAID_SOURCE',
        'An unpaid source/date cannot be counted twice.',
        409,
      );
    unpaidKeys.add(key);
    const row = unpaid.get(day) ?? { days: new Prisma.Decimal(0), sources: [] };
    row.days = row.days.plus(entry.days);
    if (row.days.gt(1))
      fail(
        'OVERLAPPING_UNPAID_DAYS',
        'Unpaid time exceeds one day on the same date.',
      );
    row.sources.push({ ...entry });
    unpaid.set(day, row);
  }
  let fullNumerator = new Prisma.Decimal(0),
    unpaidNumerator = new Prisma.Decimal(0),
    basisDays = new Prisma.Decimal(0);
  const segments = new Map<
    string,
    {
      salaryId: string;
      monthlyAmount: string;
      from: string;
      to: string;
      employedDays: number;
      unpaidDays: Prisma.Decimal;
      numerator: Prisma.Decimal;
      payableNumerator: Prisma.Decimal;
    }
  >();
  for (let day = from; day < to; day += DAY) {
    const matches = salaries.filter((s) => s.begin <= day && s.end > day);
    if (matches.length !== 1)
      fail(
        matches.length ? 'SALARY_HISTORY_OVERLAP' : 'SALARY_COVERAGE_MISSING',
        'Exactly one salary must cover every employed day.',
      );
    const salary = matches[0];
    const unpaidDays = unpaid.get(day)?.days ?? new Prisma.Decimal(0);
    const weekday = new Date(day).getUTCDay();
    const unit =
      method === 'WORKING_DAYS' && (weekday === 0 || weekday === 6)
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(1);
    basisDays = basisDays.plus(unit);
    fullNumerator = fullNumerator.plus(salary.amount.mul(unit));
    unpaidNumerator = unpaidNumerator.plus(
      salary.amount.mul(unpaidDays).mul(unit),
    );
    const row = segments.get(salary.id) ?? {
      salaryId: salary.id,
      monthlyAmount: salary.amount.toFixed(2),
      from: iso(day),
      to: iso(day),
      employedDays: 0,
      unpaidDays: new Prisma.Decimal(0),
      numerator: new Prisma.Decimal(0),
      payableNumerator: new Prisma.Decimal(0),
    };
    row.to = iso(day);
    row.employedDays++;
    row.unpaidDays = row.unpaidDays.plus(unpaidDays);
    row.numerator = row.numerator.plus(salary.amount.mul(unit));
    row.payableNumerator = row.payableNumerator.plus(
      salary.amount.mul(new Prisma.Decimal(1).minus(unpaidDays)).mul(unit),
    );
    segments.set(salary.id, row);
  }
  // A fixed-26 basis applies the daily rate to partial employment, but a
  // fully employed month remains the contracted monthly salary. Using the
  // larger of the configured divisor and worked basis days handles both while
  // retaining weighted mid-month salary changes.
  const employedDenominator =
    method === 'FIXED_26_DAYS'
      ? Prisma.Decimal.max(new Prisma.Decimal(divisor), basisDays)
      : new Prisma.Decimal(divisor);
  const employedSalary = fullNumerator
    .div(employedDenominator)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const unpaidDeduction = unpaidNumerator
    .div(divisor)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const payableSalary = employedSalary
    .minus(unpaidDeduction)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    employedSalary: employedSalary.toFixed(2),
    unpaidDeduction: unpaidDeduction.toFixed(2),
    payableSalary: payableSalary.toFixed(2),
    trace: {
      method,
      version: '1',
      sourceUrl: SOURCE,
      reference: 'Employment Act 1955 section 18A',
      periodFrom: iso(start),
      periodTo: iso(next - DAY),
      divisor,
      basisDays: basisDays.toString(),
      basisDaysInMonth: workingDays,
      employedDays: (to - from) / DAY,
      rounding:
        'Aggregate weighted numerators before division; HALF_UP to cents. Fixed-26 full months retain the monthly salary and use the configured daily rate for partial employment/unpaid deductions.',
      segments: [...segments.values()].map((s) => ({
        ...s,
        unpaidDays: s.unpaidDays.toString(),
        numerator: s.numerator.toString(),
        payableNumerator: s.payableNumerator.toString(),
      })),
      unpaidSources: [...unpaid.values()].flatMap((v) => v.sources),
    },
  };
}
