import { calculateContribution, validateRules } from './calculator';
describe('versioned contribution calculator (synthetic fixtures, not statutory reference tables)', () => {
  const rules = {
    kind: 'TABLE',
    ceiling: '200',
    bands: [
      { lower: '0', upper: '100', employee: '1.00', employer: '2.00' },
      { lower: '100', upper: '200', employee: '2.00', employer: '4.00' },
    ],
  };
  it('uses official-style band amounts rather than percentages', () => {
    expect(calculateContribution('100', rules).employee).toBe('1.00');
    expect(calculateContribution('100.01', rules).employee).toBe('2.00');
    expect(calculateContribution('999', rules).employee).toBe('2.00');
  });
  it('has no contribution for zero wages', () =>
    expect(calculateContribution('0', rules).employee).toBe('0.00'));
  it('rejects missing bands rather than returning zero', () => {
    expect(() =>
      calculateContribution('201', { ...rules, ceiling: undefined }),
    ).toThrow('No official band');
  });
  it('rejects gaps', () => {
    expect(() =>
      validateRules({
        ...rules,
        bands: [{ lower: '1', upper: '100', employee: '1', employer: '2' }],
      }),
    ).toThrow('contiguous');
  });
  it('rejects capped or malformed above-table branches', () => {
    const aboveTable = {
      employeeRate: '0.1',
      employerRate: '0.2',
      rounding: 'TOTAL_WHOLE_UP',
    };
    expect(() => validateRules({ ...rules, aboveTable })).toThrow('capped');
    expect(() =>
      validateRules({
        ...rules,
        ceiling: undefined,
        aboveTable: { ...aboveTable, kind: 'EXEMPT' },
      }),
    ).toThrow('only rates');
    expect(() =>
      validateRules({
        ...rules,
        ceiling: undefined,
        aboveTable: { ...aboveTable, employeeRate: '2' },
      }),
    ).toThrow('between zero and one');
  });
  it('rounds exact rates with decimal arithmetic', () => {
    expect(
      calculateContribution('123.45', {
        kind: 'RATE',
        employeeRate: '0.11',
        employerRate: '0.13',
        rounding: 'WHOLE_UP',
      }),
    ).toMatchObject({ employee: '14.00', employer: '17.00' });
    expect(
      calculateContribution('123.45', {
        kind: 'RATE',
        employeeRate: '0',
        employerRate: '0.01',
        rounding: 'CENTS',
      }).employer,
    ).toBe('1.23');
  });
  it('requires explicit exemption reason', () => {
    expect(() => calculateContribution('100', { kind: 'EXEMPT' })).toThrow(
      'explanation',
    );
    expect(
      calculateContribution('100', {
        kind: 'EXEMPT',
        reason: 'test category exemption',
      }).employee,
    ).toBe('0.00');
  });
  it('rejects floats supplied instead of decimal strings', () =>
    expect(() => calculateContribution(100 as never, rules)).toThrow(
      'decimal string',
    ));
});
