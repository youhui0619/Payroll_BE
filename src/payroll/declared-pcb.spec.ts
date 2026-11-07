import { calculateDeclaredPcb } from './declared-pcb';
import { FamilyReliefInput } from './family-reliefs';
const family: FamilyReliefInput = {
  year: 2026,
  residency: 'RESIDENT',
  category: 3,
  disabledIndividual: false,
  spouseReliefEligible: false,
  disabledSpouseReliefEligible: false,
  children: ['a', 'b', 'c'].map((reference) => ({
    reference,
    kind: 'STANDARD' as const,
    share: 'FULL' as const,
  })),
};
const pay = {
  year: 2026,
  month: 1,
  normal: '5500',
  additional: '0',
  normalEpf: '605',
  additionalEpf: '0',
  accumulatedIncome: '0',
  accumulatedEpf: '0',
  accumulatedMtd: '0',
  accumulatedZakat: '0',
  currentZakat: '0',
};
describe('PCB with reviewed declarations', () => {
  it('matches the normal standard formula with derived family relief', () => {
    const result = calculateDeclaredPcb(pay, family, {});
    expect(result.amount).toBe('110.00');
    expect(result.reliefTrace.family.familyReliefs).toBe('15000.00');
    expect(result.reliefTrace.expenses).toHaveLength(2);
  });
  it('recomputes voluntary EPF headroom separately for additional remuneration', () => {
    const result = calculateDeclaredPcb(
      {
        ...pay,
        month: 12,
        normalEpf: '100',
        additional: '1000',
        additionalEpf: '100',
        accumulatedEpf: '3700',
        accumulatedIncome: '50000',
      },
      family,
      { C11A: '1000' },
    );
    const [normal, additional] = result.reliefTrace.expenses;
    expect(normal.calculation.total).toBe('200.00');
    expect(additional.calculation.total).toBe('100.00');
    expect(normal.calculation.context.projectedMandatoryEpf).toBe('3800.00');
    expect(additional.calculation.context.projectedMandatoryEpf).toBe(
      '3900.00',
    );
  });
  it('does not apply resident reliefs for non-residents', () => {
    const result = calculateDeclaredPcb(
      pay,
      { ...family, residency: 'NON_RESIDENT' },
      { C5: '2500' },
    );
    expect(result.amount).toBe('1650.00');
    expect(result.reliefTrace.expenses).toEqual([]);
    expect(result.reliefTrace.reliefsApplied).toBe(false);
  });
  it('rejects mismatched years and invalid expense declarations', () => {
    expect(() =>
      calculateDeclaredPcb({ ...pay, year: 2027 }, family, {}),
    ).toThrow();
    expect(() => calculateDeclaredPcb(pay, family, { C5: '-1' })).toThrow();
  });
});
