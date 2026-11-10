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
    // Section 13 illustrates allocation using a stated RM297 deduction;
    // the selected October 2025 Part A band at RM2,650 instead yields RM293.
    expect(result.normalEpf).toBe('293.00');
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
  it('keeps company remittance rounding out of employee allocation', () => {
    const result = allocateEpfForPcb([{ ...salary, amount: '2400.01' }], {
      kind: 'RATE',
      employeeRate: '0.02',
      employerRate: '0.02',
      rounding: 'TOTAL_WHOLE_UP',
    });
    expect(result.normalEpf).toBe('48.00');
    expect(result.additionalEpf).toBe('0.00');
    expect(result.totalEmployeeEpf).toBe('48.00');
    expect(result.trace.totalCalculation.total).toBe('97.00');
  });
  it('rejects a negative remuneration class even when total wages are positive', () => {
    expect(() =>
      allocateEpfForPcb(
        [
          salary,
          {
            ...salary,
            kind: 'DEDUCTION',
            amount: '100',
            statutoryBases: ['EPF'],
            pcbTreatment: 'EXCLUDED_ADDITIONAL',
            source: { type: 'ADJUSTMENT', id: 'negative-additional' },
          },
        ],
        rules,
      ),
    ).toThrow();
  });
});
