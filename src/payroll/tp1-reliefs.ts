import { Prisma } from '@prisma/client';
import { decimal } from './calculator';
import { fail } from '../common/domain';

export const TP1_SOURCE =
  'https://www.hasil.gov.my/wp-content/uploads/bi-tp1-form-2026.pdf';
// Codes follow the official form. Combined unrestricted subitems are submitted
// once; sublimited items remain separate to prevent bypassing their shared cap.
export const TP1_CODES = [
  'C1AB',
  'C1C',
  'C2',
  'C3AB',
  'C3C',
  'C4AB',
  'C4C',
  'C4D',
  'C4E',
  'C4F',
  'C5',
  'C6',
  'C7',
  'C8',
  'C9',
  'C10',
  'C11A',
  'C11B',
  'C12',
  'C13',
  'C14',
  'C15',
  'C16A',
  'C16B',
  'C17',
] as const;
export type Tp1Code = (typeof TP1_CODES)[number];
export interface Tp1ReliefInput {
  year: number;
  /** Reviewed cumulative current-year amounts, including previous employment.
   * Do not add historical revisions or reuse one receipt in different codes. */
  amounts: Partial<Record<Tp1Code, string>>;
  spouseRelief: string;
  /** Annual mandatory EPF deduction already claimed by the PCB projection. */
  projectedMandatoryEpf: string;
}
export function calculateTp1Reliefs(input: Tp1ReliefInput) {
  if (input.year !== 2026)
    fail('INVALID_TP1_YEAR', 'This TP1 schedule supports 2026 only.', 400);
  if (
    !input.amounts ||
    typeof input.amounts !== 'object' ||
    Array.isArray(input.amounts) ||
    Object.keys(input.amounts).some((k) => !TP1_CODES.includes(k as Tp1Code))
  )
    fail('INVALID_TP1_CODE', 'Use supported 2026 TP1 deduction codes.', 400);
  const money = (value: unknown, name: string) => {
    const amount = decimal(value, name);
    if (amount.decimalPlaces() > 2)
      fail(
        'INVALID_TP1_AMOUNT',
        'TP1 amounts must have at most two decimal places.',
        400,
      );
    return amount;
  };
  const spouse = money(input.spouseRelief, 'spouseRelief');
  const mandatoryEpf = money(
    input.projectedMandatoryEpf,
    'projectedMandatoryEpf',
  );
  if (spouse.gt(4000) || mandatoryEpf.gt(4000))
    fail(
      'INVALID_TP1_CONTEXT',
      'Spouse and projected qualifying mandatory EPF deductions each cannot exceed 4000.',
      400,
    );
  const amounts = Object.fromEntries(
    TP1_CODES.map((code) => [code, money(input.amounts[code] ?? '0', code)]),
  ) as Record<Tp1Code, Prisma.Decimal>;
  if (amounts.C16A.gt(0) && amounts.C16B.gt(0))
    fail(
      'TP1_HOME_BAND_CONFLICT',
      'Use only the applicable first-home price band.',
      400,
    );
  const D = Prisma.Decimal;
  const capped = (code: Tp1Code, limit: number | Prisma.Decimal) =>
    D.min(amounts[code], limit);
  const groups: {
    code: string;
    claimed: string;
    allowed: string;
    limit: string;
    subitems: { code: Tp1Code; claimed: string; afterSublimit: string }[];
  }[] = [];
  const group = (
    code: string,
    limit: number | Prisma.Decimal,
    entries: [Tp1Code, number | Prisma.Decimal | null][],
  ) => {
    const subitems = entries.map(([key, sublimit]) => ({
      code: key,
      claimed: amounts[key].toFixed(2),
      afterSublimit: (sublimit === null
        ? amounts[key]
        : capped(key, sublimit)
      ).toFixed(2),
    }));
    const claimed = subitems.reduce(
      (sum, row) => sum.plus(row.claimed),
      new D(0),
    );
    const subtotal = subitems.reduce(
      (sum, row) => sum.plus(row.afterSublimit),
      new D(0),
    );
    const allowed = D.min(subtotal, limit);
    groups.push({
      code,
      claimed: claimed.toFixed(2),
      allowed: allowed.toFixed(2),
      limit: new D(limit).toFixed(2),
      subitems,
    });
  };
  group('C1', 8000, [
    ['C1AB', null],
    ['C1C', 1000],
  ]);
  group('C2', 6000, [['C2', null]]);
  group('C3', 7000, [
    ['C3AB', null],
    ['C3C', 2000],
  ]);
  group('C4', 10000, [
    ['C4AB', null],
    ['C4C', 1000],
    ['C4D', 1000],
    ['C4E', 1000],
    ['C4F', 10000],
  ]);
  for (const [code, cap] of [
    ['C5', 2500],
    ['C6', 1000],
    ['C7', 1000],
    ['C8', 3000],
    ['C9', 8000],
  ] as const)
    group(code, cap, [[code, null]]);
  group('C10', new D(4000).minus(spouse), [['C10', null]]);
  group('C11', new D(7000).minus(mandatoryEpf), [
    ['C11A', new D(4000).minus(mandatoryEpf)],
    ['C11B', 3000],
  ]);
  for (const [code, cap] of [
    ['C12', 3000],
    ['C13', 4000],
    ['C14', 350],
    ['C15', 2500],
  ] as const)
    group(code, cap, [[code, null]]);
  group('C16', amounts.C16B.gt(0) ? 5000 : 7000, [
    ['C16A', 7000],
    ['C16B', 5000],
  ]);
  group('C17', 1000, [['C17', null]]);
  return {
    year: 2026,
    total: groups.reduce((sum, g) => sum.plus(g.allowed), new D(0)).toFixed(2),
    groups,
    context: {
      spouseRelief: spouse.toFixed(2),
      projectedMandatoryEpf: mandatoryEpf.toFixed(2),
    },
    sourceUrl: TP1_SOURCE,
    limitations: [
      'Eligibility, receipts, recurring-claim restrictions and any previous-employer amounts must be reviewed before submission.',
      'Amounts are cumulative replacement totals, not monthly increments. Do not double count receipts or automatically add payroll SOCSO/EIS again.',
      'D1 rebates are excluded; zakat and religious travel levies require separate handling.',
      'C11A uses the remaining EPF allowance after the mandatory EPF projection; recompute when that projection changes.',
    ],
  };
}
