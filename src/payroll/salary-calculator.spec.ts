import { calculateSalary } from './salary-calculator';

const base = {
  year: 2026,
  month: 1,
  joinedDate: '2025-01-01',
  salaries: [{ id: 'salary', amount: '3100.00', effectiveFrom: '2025-01-01' }],
};
describe('calendar salary proration', () => {
  it('pays a full monthly rate including weekends and holidays', () => {
    expect(calculateSalary(base).payableSalary).toBe('3100.00');
  });
  it('includes joining and final employment dates', () => {
    const result = calculateSalary({
      ...base,
      joinedDate: '2026-01-16',
      lastEmploymentDate: '2026-01-25',
    });
    expect(result.payableSalary).toBe('1000.00');
    expect(result.trace.employedDays).toBe(10);
  });
  it('uses actual month length including leap years', () => {
    expect(
      calculateSalary({
        ...base,
        year: 2028,
        month: 2,
        joinedDate: '2028-02-29',
        salaries: [{ ...base.salaries[0], amount: '2900' }],
      }).payableSalary,
    ).toBe('100.00');
    expect(
      calculateSalary({
        ...base,
        month: 2,
        joinedDate: '2026-02-28',
        salaries: [{ ...base.salaries[0], amount: '2800' }],
      }).payableSalary,
    ).toBe('100.00');
  });
  it('applies effective salary and unpaid days together', () => {
    const result = calculateSalary({
      ...base,
      salaries: [
        {
          id: 'old',
          amount: '3100',
          effectiveFrom: '2025-01-01',
          effectiveTo: '2026-01-16',
        },
        { id: 'new', amount: '6200', effectiveFrom: '2026-01-16' },
      ],
      unpaidDays: [
        { date: '2026-01-15', days: '1', sourceId: 'leave1' },
        { date: '2026-01-16', days: '0.5', sourceId: 'leave2' },
      ],
    });
    expect(result.employedSalary).toBe('4700.00');
    expect(result.unpaidDeduction).toBe('200.00');
    expect(result.payableSalary).toBe('4500.00');
    expect(result.trace.segments.map((s) => s.salaryId)).toEqual([
      'old',
      'new',
    ]);
  });
  it('avoids daily rounding drift and reconciles rounded deductions', () => {
    const result = calculateSalary({
      ...base,
      salaries: [{ ...base.salaries[0], amount: '1000' }],
      unpaidDays: [{ date: '2026-01-01', days: '1', sourceId: 'leave' }],
    });
    expect(result.employedSalary).toBe('1000.00');
    expect(result.payableSalary).toBe('967.74');
    expect(result.unpaidDeduction).toBe('32.26');
  });
  it('rejects salary gaps, overlaps and duplicate sources', () => {
    expect(() => calculateSalary({ ...base, salaries: [] })).toThrow();
    expect(() =>
      calculateSalary({
        ...base,
        salaries: [...base.salaries, { ...base.salaries[0], id: 'overlap' }],
      }),
    ).toThrow();
    expect(() =>
      calculateSalary({
        ...base,
        salaries: [...base.salaries, ...base.salaries],
      }),
    ).toThrow();
  });
  it('rejects invalid dates and out-of-period or duplicate unpaid days', () => {
    expect(() =>
      calculateSalary({ ...base, joinedDate: '2026-02-30' }),
    ).toThrow();
    expect(() => calculateSalary({ ...base, month: 13 })).toThrow();
    const leave = { date: '2026-01-01', days: '1' as const, sourceId: 'leave' };
    expect(() =>
      calculateSalary({ ...base, unpaidDays: [leave, leave] }),
    ).toThrow();
    expect(() =>
      calculateSalary({
        ...base,
        unpaidDays: [leave, { ...leave, sourceId: 'other' }],
      }),
    ).toThrow();
    expect(() =>
      calculateSalary({
        ...base,
        unpaidDays: [{ ...leave, date: '2026-02-01' }],
      }),
    ).toThrow();
  });
  it('supports two independent half days and fully unpaid months', () => {
    expect(
      calculateSalary({
        ...base,
        unpaidDays: [
          { date: '2026-01-01', days: '0.5', sourceId: 'a' },
          { date: '2026-01-01', days: '0.5', sourceId: 'b' },
        ],
      }).unpaidDeduction,
    ).toBe('100.00');
    const result = calculateSalary({
      ...base,
      joinedDate: '2026-01-31',
      unpaidDays: [{ date: '2026-01-31', days: '1', sourceId: 'a' }],
    });
    expect(result.payableSalary).toBe('0.00');
    expect(result.unpaidDeduction).toBe('100.00');
  });
});
