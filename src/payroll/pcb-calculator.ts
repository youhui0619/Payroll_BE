import { Prisma } from '@prisma/client';
import { fail } from '../common/domain';
import { decimal } from './calculator';

const D = Prisma.Decimal;
const truncate = (v: Prisma.Decimal) => v.toDecimalPlaces(2, D.ROUND_DOWN);
const positive = (v: Prisma.Decimal) => D.max(0, v);
export const PCB_SOURCE =
  'https://www.hasil.gov.my/wp-content/uploads/spesifikasi-kaedah-pengiraan-berkomputer-pcb-2026.pdf';
export const PCB_SOURCE_SHA256 =
  'a1618051c858393d92d868c9975c183309d3d07e48f0e4f0cdef589f45f5800c';

/** Normalized taxable amounts only: exemption and TP1/TP3 eligibility belong to
 * the input resolver. This pure engine does not infer eligibility from claims. */
export interface PcbInput {
  year: number;
  month: number;
  residency: 'RESIDENT' | 'NON_RESIDENT';
  category: 1 | 2 | 3;
  normal: string;
  additional: string;
  normalEpf: string;
  additionalEpf: string;
  accumulatedIncome: string;
  accumulatedEpf: string;
  accumulatedMtd: string;
  accumulatedZakat: string;
  currentZakat: string;
  /** Approved combined annual D + S + DU + SU + QC + LP reliefs, excluding EPF. */
  qualifyingReliefs: string;
}

// LHDN 2026 Table 1: upper bound, M, R, B(category 1/3), B(category 2).
const taxBands = [
  ['20000', '5000', '0.01', '-400', '-800'],
  ['35000', '20000', '0.03', '-250', '-650'],
  ['50000', '35000', '0.06', '600', '600'],
  ['70000', '50000', '0.11', '1500', '1500'],
  ['100000', '70000', '0.19', '3700', '3700'],
  ['400000', '100000', '0.25', '9400', '9400'],
  ['600000', '400000', '0.26', '84400', '84400'],
  ['2000000', '600000', '0.28', '136400', '136400'],
  [null, '2000000', '0.30', '528400', '528400'],
] as const;

function annualTax(p: Prisma.Decimal, category: number) {
  if (p.lte(5000)) return new D(0);
  const [, m, r, b13, b2] = taxBands.find(
    ([upper]) => upper === null || p.lte(upper),
  );
  return positive(
    truncate(
      p
        .minus(m)
        .mul(r)
        .plus(category === 2 ? b2 : b13),
    ),
  );
}

/** Terms E.1-4: truncate cents, minimum before zakat, then round up to 5 sen. */
export function pcbDeduction(value: Prisma.Decimal): Prisma.Decimal {
  const cents = truncate(positive(value));
  return cents.lt(10) ? new D(0) : cents.div('0.05').ceil().mul('0.05');
}

export interface PcbEpfProjection {
  prior: string;
  currentNormal: string;
  currentAdditional: string;
  futureMonthly: string;
  annual: string;
  includesAdditional: boolean;
}

export function calculatePcb(
  input: Readonly<PcbInput>,
  reliefForProjection?: (projection: PcbEpfProjection) => string,
) {
  if (
    input.year !== 2026 ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  )
    fail(
      'INVALID_PCB_PERIOD',
      'This PCB version supports months 1–12 of 2026 only.',
      400,
    );
  if (
    !['RESIDENT', 'NON_RESIDENT'].includes(input.residency) ||
    ![1, 2, 3].includes(input.category)
  )
    fail(
      'INVALID_PCB_CATEGORY',
      'Specify a supported residency and employee category.',
      400,
    );
  const amount = (key: keyof PcbInput) => {
    const value = decimal(input[key], key);
    if (value.decimalPlaces() > 2)
      fail(
        'INVALID_CALCULATION_INPUT',
        key + ' must have at most two decimal places.',
        400,
      );
    return value;
  };
  const y1 = amount('normal'),
    yt = amount('additional');
  const epf1 = amount('normalEpf'),
    epft = amount('additionalEpf');
  const y = amount('accumulatedIncome'),
    epf = amount('accumulatedEpf');
  const x = amount('accumulatedMtd'),
    z = amount('accumulatedZakat');
  const currentZakat = amount('currentZakat'),
    relief = amount('qualifyingReliefs');
  // Section 13 includes EPF on tax-exempt allowances. Taxable remuneration is
  // therefore not an upper bound for EPF; contribution provenance is resolved
  // against the EPF wage basis before invoking this normalized calculator.
  if (input.residency === 'NON_RESIDENT') {
    const total = pcbDeduction(y1.plus(yt).mul('0.30'));
    return {
      amount: total.toFixed(2),
      trace: {
        version: 'PCB_2026_V1',
        sourceUrl: PCB_SOURCE,
        residency: input.residency,
        taxableRemuneration: y1.plus(yt).toFixed(2),
        rate: '0.30',
      },
    };
  }
  const n = 12 - input.month;
  const k = D.min(epf, 4000);
  const k1 = D.min(epf1, positive(new D(4000).minus(k)));
  const project = (includeAdditional: boolean) => {
    const kt = includeAdditional
      ? D.min(epft, positive(new D(4000).minus(k).minus(k1)))
      : new D(0);
    const k2 = n
      ? truncate(
          D.min(k1, positive(new D(4000).minus(k).minus(k1).minus(kt)).div(n)),
        )
      : new D(0);
    const epfProjection: PcbEpfProjection = {
      prior: k.toFixed(2),
      currentNormal: k1.toFixed(2),
      currentAdditional: kt.toFixed(2),
      futureMonthly: k2.toFixed(2),
      annual: k.plus(k1).plus(kt).plus(k2.mul(n)).toFixed(2),
      includesAdditional: includeAdditional,
    };
    const projectionRelief = reliefForProjection
      ? decimal(reliefForProjection(epfProjection), 'resolved reliefs')
      : relief;
    if (projectionRelief.decimalPlaces() > 2)
      fail(
        'INVALID_CALCULATION_INPUT',
        'Resolved reliefs must use currency precision.',
        400,
      );
    const p = positive(
      y
        .minus(k)
        .plus(y1.minus(k1))
        .plus(y1.minus(k2).mul(n))
        .plus(includeAdditional ? yt.minus(kt) : 0)
        .minus(projectionRelief),
    );
    return {
      p,
      tax: annualTax(p, input.category),
      k2,
      kt,
      epfProjection,
      projectionRelief,
    };
  };
  const normal = project(false);
  const normalMtd = pcbDeduction(
    normal.tax
      .minus(z)
      .minus(x)
      .div(n + 1),
  );
  const projectedMtd = x.plus(normalMtd.mul(n + 1));
  const additional = project(true);
  const extraMtd = yt.gt(0)
    ? pcbDeduction(additional.tax.minus(projectedMtd).minus(z))
    : new D(0);
  // Preserve excess current zakat against additional MTD (terms E.5, rows b/c).
  const net = positive(normalMtd.plus(extraMtd).minus(currentZakat));
  const total = truncate(net).div('0.05').ceil().mul('0.05');
  return {
    amount: total.toFixed(2),
    trace: {
      version: 'PCB_2026_V1',
      sourceUrl: PCB_SOURCE,
      residency: input.residency,
      remainingMonths: n,
      qualifyingEpfPrior: k.toFixed(2),
      qualifyingEpfCurrent: k1.toFixed(2),
      normal: {
        qualifyingReliefs: normal.projectionRelief.toFixed(2),
        epfProjection: normal.epfProjection,
        projectedIncome: normal.p.toFixed(2),
        futureMonthlyEpf: normal.k2.toFixed(2),
        annualTax: normal.tax.toFixed(2),
        mtdBeforeZakat: normalMtd.toFixed(2),
      },
      additional: {
        qualifyingReliefs: additional.projectionRelief.toFixed(2),
        epfProjection: additional.epfProjection,
        projectedIncome: additional.p.toFixed(2),
        futureMonthlyEpf: additional.k2.toFixed(2),
        qualifyingEpf: additional.kt.toFixed(2),
        annualTax: additional.tax.toFixed(2),
        projectedNormalMtd: projectedMtd.toFixed(2),
        mtd: extraMtd.toFixed(2),
      },
      currentZakat: currentZakat.toFixed(2),
    },
  };
}
