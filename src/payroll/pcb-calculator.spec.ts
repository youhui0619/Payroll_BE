import { Prisma } from '@prisma/client';
import {
  calculatePcb,
  pcbDeduction,
  PcbInput,
  PCB_SOURCE_SHA256,
} from './pcb-calculator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const base: PcbInput = {
  year: 2026,
  month: 1,
  residency: 'RESIDENT',
  category: 3,
  normal: '5500',
  additional: '0',
  normalEpf: '605',
  additionalEpf: '0',
  accumulatedIncome: '0',
  accumulatedEpf: '0',
  accumulatedMtd: '0',
  accumulatedZakat: '0',
  currentZakat: '0',
  qualifyingReliefs: '15000',
};

describe('PCB 2026 source examples (LHDN Exhibit 5 pages 45–51)', () => {
  it('accepts EPF on tax-exempt additional allowances described in section 13', () => {
    const result = calculatePcb({
      ...base,
      normal: '2400',
      additional: '0',
      normalEpf: '264',
      additionalEpf: '51',
    });
    expect(result.trace.additional.qualifyingEpf).toBe('51.00');
  });
  it('matches the archived official PDF checksum', () => {
    const source = readFileSync(
      resolve(__dirname, '../../statutory/sources/pcb-specification-2026.pdf'),
    );
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      PCB_SOURCE_SHA256,
    );
  });
  // The 2026 publication retains 2025 labels on these unchanged formula examples.
  it.each([
    {
      month: 1,
      accumulatedIncome: '0',
      accumulatedEpf: '0',
      accumulatedMtd: '0',
      qualifyingReliefs: '15000',
      p: '47000.07',
      k2: '308.63',
      mtd: '110.00',
    },
    {
      month: 2,
      accumulatedIncome: '5500',
      accumulatedEpf: '605',
      accumulatedMtd: '110',
      qualifyingReliefs: '15000',
      p: '47000.00',
      k2: '279.00',
      mtd: '110.00',
    },
    {
      month: 3,
      accumulatedIncome: '11000',
      accumulatedEpf: '1210',
      accumulatedMtd: '220',
      qualifyingReliefs: '15300',
      p: '46700.07',
      k2: '242.77',
      mtd: '108.20',
    },
  ])('matches month $month', ({ p, k2, mtd, ...values }) => {
    const result = calculatePcb({ ...base, ...values });
    expect(result.amount).toBe(mtd);
    expect(result.trace.normal).toMatchObject({
      projectedIncome: p,
      futureMonthlyEpf: k2,
    });
  });
  it('matches all intermediate bonus projections and final RM833.70', () => {
    const result = calculatePcb({
      ...base,
      month: 4,
      accumulatedIncome: '16500',
      accumulatedEpf: '1815',
      accumulatedMtd: '328.20',
      qualifyingReliefs: '15600',
      additional: '8250',
      additionalEpf: '908',
    });
    expect(result.amount).toBe('833.70');
    expect(result.trace.normal).toMatchObject({
      projectedIncome: '46400.00',
      futureMonthlyEpf: '197.50',
      mtdBeforeZakat: '106.20',
    });
    expect(result.trace.additional).toMatchObject({
      projectedIncome: '54650.00',
      futureMonthlyEpf: '84.00',
      annualTax: '2011.50',
      projectedNormalMtd: '1284.00',
      mtd: '727.50',
    });
  });
  it('uses non-resident taxable pay at 30% without resident reliefs', () => {
    expect(
      calculatePcb({ ...base, residency: 'NON_RESIDENT', normal: '3000' })
        .amount,
    ).toBe('900.00');
  });
});

describe('PCB arithmetic and boundary invariants', () => {
  it.each([
    ['35000', '200.00'],
    ['35000.01', '600.00'],
    ['50000', '1500.00'],
    ['70000', '3700.00'],
    ['100000', '9400.00'],
    ['400000', '84400.00'],
    ['600000', '136400.00'],
    ['2000000', '528400.00'],
    ['2000100', '528430.00'],
  ])('applies the annual tax band at chargeable income %s', (p, expected) => {
    expect(
      calculatePcb({
        ...base,
        month: 12,
        category: 1,
        normal: new Prisma.Decimal(p).plus(9000).toFixed(2),
        normalEpf: '0',
        qualifyingReliefs: '9000',
      }).amount,
    ).toBe(expected);
  });
  it.each([
    ['123.4534', '123.45'],
    ['287.02', '287.05'],
    ['152.06', '152.10'],
    ['9.99', '0.00'],
    ['10.00', '10.00'],
  ])('truncates and rounds %s to %s', (input, output) => {
    expect(pcbDeduction(new Prisma.Decimal(input)).toFixed(2)).toBe(output);
  });
  it('collects amounts below RM10 after zakat and never refunds overpaid tax', () => {
    expect(calculatePcb({ ...base, currentZakat: '105' }).amount).toBe('5.00');
    expect(calculatePcb({ ...base, accumulatedMtd: '99999' }).amount).toBe(
      '0.00',
    );
    expect(calculatePcb({ ...base, currentZakat: '99999' }).amount).toBe(
      '0.00',
    );
  });
  it('uses excess current zakat against bonus tax', () => {
    const result = calculatePcb({
      ...base,
      month: 4,
      accumulatedIncome: '16500',
      accumulatedEpf: '1815',
      accumulatedMtd: '328.20',
      qualifyingReliefs: '15600',
      additional: '8250',
      additionalEpf: '908',
      currentZakat: '200',
    });
    expect(result.amount).toBe('633.70');
  });
  it('handles December and exhausted EPF relief without dividing by zero', () => {
    const result = calculatePcb({
      ...base,
      month: 12,
      accumulatedIncome: '60500',
      accumulatedEpf: '6655',
      accumulatedMtd: '1210',
    });
    expect(result.amount).toBe('110.00');
    expect(result.trace.qualifyingEpfCurrent).toBe('0.00');
    expect(result.trace.normal.futureMonthlyEpf).toBe('0.00');
  });
  it('rejects unsupported periods, amounts and categories', () => {
    for (const change of [
      { year: 2027 },
      { month: 0 },
      { month: 1.5 },
      { category: 4 },
      { normal: '-1' },
      { normal: '1.001' },
      { normalEpf: '6000' },
    ]) {
      expect(() => calculatePcb({ ...base, ...change } as PcbInput)).toThrow();
    }
  });
});
