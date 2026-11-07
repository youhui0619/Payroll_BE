import { calculateTp1Reliefs } from './tp1-reliefs';
const base = {
  year: 2026,
  amounts: {},
  spouseRelief: '0',
  projectedMandatoryEpf: '0',
};
describe('2026 TP1 deduction limits', () => {
  it('defaults omitted expense codes to zero', () =>
    expect(calculateTp1Reliefs(base).total).toBe('0.00'));
  it('applies medical sublimits before their shared annual limit', () => {
    const result = calculateTp1Reliefs({
      ...base,
      amounts: {
        C4AB: '8000',
        C4C: '2000',
        C4D: '1500',
        C4E: '3000',
        C4F: '10000',
      },
    });
    const group = result.groups.find((g) => g.code === 'C4');
    expect(group.allowed).toBe('10000.00');
    expect(group.subitems.find((i) => i.code === 'C4C').afterSublimit).toBe(
      '1000.00',
    );
  });
  it('enforces parent and education shared/sub limits', () => {
    const result = calculateTp1Reliefs({
      ...base,
      amounts: { C1AB: '7500', C1C: '2000', C3AB: '6000', C3C: '3000' },
    });
    expect(result.total).toBe('15000.00');
    expect(
      result.groups.find((g) => g.code === 'C3').subitems[1].afterSublimit,
    ).toBe('2000.00');
  });
  it('does not double count spouse or mandatory EPF allowances', () => {
    const result = calculateTp1Reliefs({
      ...base,
      amounts: { C10: '4000', C11A: '4000', C11B: '5000' },
      spouseRelief: '4000',
      projectedMandatoryEpf: '3500',
    });
    expect(result.groups.find((g) => g.code === 'C10').allowed).toBe('0.00');
    expect(result.groups.find((g) => g.code === 'C11').allowed).toBe('3500.00');
  });
  it('enforces the correct first-home band and rejects double claims', () => {
    expect(
      calculateTp1Reliefs({ ...base, amounts: { C16B: '9000' } }).total,
    ).toBe('5000.00');
    expect(() =>
      calculateTp1Reliefs({ ...base, amounts: { C16A: '1', C16B: '1' } }),
    ).toThrow();
  });
  it('rejects unsupported codes, negative amounts and invalid contexts', () => {
    expect(() =>
      calculateTp1Reliefs({ ...base, amounts: { UNKNOWN: '1' } as never }),
    ).toThrow();
    expect(() =>
      calculateTp1Reliefs({ ...base, amounts: { C2: '-1' } }),
    ).toThrow();
    expect(() =>
      calculateTp1Reliefs({ ...base, projectedMandatoryEpf: '4001' }),
    ).toThrow();
    expect(() =>
      calculateTp1Reliefs({ ...base, amounts: { C2: '1.001' } }),
    ).toThrow();
  });
});
