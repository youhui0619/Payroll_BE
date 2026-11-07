import { allocateEpfForPcb } from './epf-allocation';
import { PayrollComponent } from './payroll-calculator';
import { statutoryCatalog } from './data/catalog';
const salary: PayrollComponent = {
  code: 'BASIC',
  kind: 'EARNING',
  amount: '2400',
  affectsGross: true,
  affectsNet: true,
  statutoryBases: ['EPF', 'PCB'],
  pcbTreatment: 'NORMAL',
  source: { type: 'SALARY', id: 'salary' },
};
const rules = statutoryCatalog.find(
  (r) => r.key === 'EPF_2025_10_PART_A',
).parameters;
describe('LHDN section 13 EPF allocation', () => {
  it('includes regular exempt allowances in normal EPF', () => {
    const result = allocateEpfForPcb(
      [
        salary,
        {
          ...salary,
          amount: '250',
          statutoryBases: ['EPF'],
          pcbTreatment: 'EXCLUDED_NORMAL',
          source: { type: 'ALLOWANCE', id: 'childcare' },
        },
      ],
      rules,
    );
    expect(result.normalEpf).toBe('297.00');
    expect(result.additionalEpf).toBe('0.00');
  });
  it('allocates one-off exempt allowance by total-minus-normal difference', () => {
    const result = allocateEpfForPcb(
      [
        salary,
        {
          ...salary,
          amount: '450',
          statutoryBases: ['EPF'],
          pcbTreatment: 'EXCLUDED_ADDITIONAL',
          source: { type: 'ALLOWANCE', id: 'meal' },
        },
      ],
      rules,
    );
    expect(result.normalEpf).toBe('264.00');
    expect(result.additionalEpf).toBe('51.00');
  });
  it('allocates taxable bonuses using the same source example', () => {
    const result = allocateEpfForPcb(
      [
        salary,
        {
          ...salary,
          amount: '3600',
          pcbTreatment: 'ADDITIONAL',
          source: { type: 'BONUS', id: 'bonus' },
        },
      ],
      rules,
    );
    expect(result.normalEpf).toBe('264.00');
    expect(result.additionalEpf).toBe('396.00');
  });
  it('rejects ambiguous EPF-only classifications', () => {
    expect(() =>
      allocateEpfForPcb(
        [{ ...salary, statutoryBases: ['EPF'], pcbTreatment: 'EXCLUDED' }],
        rules,
      ),
    ).toThrow();
  });
});
