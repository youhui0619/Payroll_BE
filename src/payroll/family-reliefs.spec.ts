import { calculateFamilyReliefs, FamilyReliefInput } from './family-reliefs';
const base: FamilyReliefInput = {
  year: 2026,
  residency: 'RESIDENT',
  category: 1,
  disabledIndividual: false,
  spouseReliefEligible: false,
  disabledSpouseReliefEligible: false,
  children: [],
};
describe('2026 family reliefs', () => {
  it('provides the standard individual relief without accepting an arbitrary amount', () => {
    expect(calculateFamilyReliefs(base).familyReliefs).toBe('9000.00');
  });
  it('combines eligible individual/spouse disability and child classifications', () => {
    const result = calculateFamilyReliefs({
      ...base,
      category: 2,
      disabledIndividual: true,
      spouseReliefEligible: true,
      disabledSpouseReliefEligible: true,
      children: [
        { reference: 'A', kind: 'STANDARD', share: 'FULL' },
        { reference: 'B', kind: 'HIGHER_EDUCATION', share: 'FULL' },
        { reference: 'C', kind: 'DISABLED', share: 'HALF' },
        { reference: 'D', kind: 'DISABLED_HIGHER_EDUCATION', share: 'FULL' },
      ],
    });
    expect(result.childTotal).toBe('30000.00');
    expect(result.familyReliefs).toBe('56000.00');
  });
  it('does not stack disabled and disabled-higher-education relief for the same child', () => {
    expect(() =>
      calculateFamilyReliefs({
        ...base,
        category: 3,
        children: [
          { reference: 'A', kind: 'DISABLED', share: 'FULL' },
          { reference: 'A', kind: 'DISABLED_HIGHER_EDUCATION', share: 'FULL' },
        ],
      }),
    ).toThrow();
  });
  it('applies no personal reliefs to non-residents', () => {
    expect(
      calculateFamilyReliefs({
        ...base,
        residency: 'NON_RESIDENT',
        disabledIndividual: true,
      }).familyReliefs,
    ).toBe('0.00');
  });
  it('rejects unsupported years, categories and contradictory family inputs', () => {
    expect(() => calculateFamilyReliefs({ ...base, year: 2027 })).toThrow();
    expect(() =>
      calculateFamilyReliefs({ ...base, spouseReliefEligible: true }),
    ).toThrow();
    expect(() =>
      calculateFamilyReliefs({
        ...base,
        children: [{ reference: 'child', kind: 'STANDARD', share: 'FULL' }],
      }),
    ).toThrow();
  });
});
