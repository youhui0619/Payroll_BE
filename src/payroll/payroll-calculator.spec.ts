import {
  payrollBases,
  payrollTotals,
  PayrollComponent,
  PayrollContribution,
} from './payroll-calculator';
import { calculateContribution } from './calculator';
import { statutoryCatalog } from './data/catalog';

const salary: PayrollComponent = {
  code: 'BASIC',
  kind: 'EARNING',
  amount: '6710.00',
  affectsGross: true,
  affectsNet: true,
  statutoryBases: ['EPF', 'SOCSO', 'EIS', 'LINDUNG_24_JAM', 'PCB', 'HRD'],
  source: { type: 'SALARY', id: 'salary-1' },
};
describe('payroll wage bases and totals', () => {
  it('separates normal and additional PCB remuneration after category-specific deductions', () => {
    const result = payrollBases([
      { ...salary, pcbTreatment: 'NORMAL' },
      {
        ...salary,
        code: 'BONUS',
        amount: '1000',
        pcbTreatment: 'ADDITIONAL',
        source: { type: 'MANUAL', id: 'bonus' },
      },
      {
        ...salary,
        code: 'UNPAID',
        amount: '210',
        kind: 'DEDUCTION',
        pcbTreatment: 'NORMAL',
        source: { type: 'LEAVE', id: 'leave' },
      },
    ]);
    expect(result.pcbRemuneration).toEqual({
      normal: '6500.00',
      additional: '1000.00',
      unclassified: '0.00',
    });
    expect(result.bases.PCB).toBe('7500.00');
  });
  it('retains unclassified legacy amounts without silently calling them normal', () => {
    expect(payrollBases([salary]).pcbRemuneration.unclassified).toBe('6710.00');
  });
  it('rejects contradictory flags and deductions exceeding their remuneration category', () => {
    expect(() =>
      payrollBases([{ ...salary, pcbTreatment: 'EXCLUDED' }]),
    ).toThrow();
    expect(() =>
      payrollBases([{ ...salary, pcbTreatment: 'NORMAL', statutoryBases: [] }]),
    ).toThrow();
    expect(() =>
      payrollBases([
        { ...salary, pcbTreatment: 'NORMAL' },
        {
          ...salary,
          kind: 'DEDUCTION',
          amount: '10',
          pcbTreatment: 'ADDITIONAL',
          source: { type: 'MANUAL', id: 'deduction' },
        },
      ]),
    ).toThrow();
  });
  it('keeps reimbursements outside gross/statutory bases and deducts unpaid leave from configured bases', () => {
    const components: PayrollComponent[] = [
      salary,
      {
        ...salary,
        code: 'UNPAID_LEAVE',
        kind: 'DEDUCTION',
        amount: '210',
        source: { type: 'LEAVE', id: 'leave-1' },
      },
      {
        ...salary,
        code: 'CLAIM',
        amount: '100',
        affectsGross: false,
        statutoryBases: [],
        source: { type: 'CLAIM', id: 'claim-1' },
      },
      {
        ...salary,
        code: 'ADVANCE',
        kind: 'DEDUCTION',
        amount: '50',
        affectsGross: false,
        statutoryBases: [],
        source: { type: 'ADVANCE', id: 'advance-1' },
      },
    ];
    expect(payrollTotals(components, [])).toMatchObject({
      gross: '6500.00',
      earnings: '6810.00',
      componentDeductions: '260.00',
      net: '6550.00',
      deductions: '260.00',
      bases: { EPF: '6500.00', HRD: '6500.00' },
    });
  });
  it('assigns the KWSP rounding difference to company costs without increasing the employee deduction', () => {
    const rules = statutoryCatalog.find(
      (e) => e.category === 'PART_F',
    ).parameters;
    const contribution: PayrollContribution = {
      scheme: 'EPF',
      rulesetId: 'rules-1',
      version: '2025-10-v1',
      result: calculateContribution('6710', rules),
    };
    const result = payrollTotals([salary], [contribution]);
    expect(result).toMatchObject({
      gross: '6710.00',
      employeeContributions: '134.20',
      employerContributions: '134.80',
      employerRounding: '0.60',
      net: '6575.80',
    });
    expect(result.statutory[0]).toMatchObject({
      remittance: '269.00',
      employerRounding: '0.60',
      result: { trace: { roundingAllocation: 'EMPLOYER' } },
    });
    expect(contribution.result.trace.roundingAllocation).toBe('UNALLOCATED');
  });
  it('rejects duplicate sources and duplicate scheme deductions', () => {
    expect(() => payrollBases([salary, salary])).toThrow('same payroll source');
    const c: PayrollContribution = {
      scheme: 'EPF',
      rulesetId: 'id',
      version: 'v',
      result: { employee: '1', employer: '2', basis: '6710', trace: {} },
    };
    expect(() => payrollTotals([salary], [c, c])).toThrow('only once');
  });
  it('rejects inconsistent statutory totals and wage bases', () => {
    const c: PayrollContribution = {
      scheme: 'EPF',
      rulesetId: 'id',
      version: 'v',
      result: {
        employee: '1',
        employer: '2',
        basis: '6710',
        trace: {},
        total: '4',
      },
    };
    expect(() => payrollTotals([salary], [c])).toThrow('reconcile');
    expect(() =>
      payrollTotals(
        [salary],
        [{ ...c, result: { ...c.result, basis: '9999' } }],
      ),
    ).toThrow('exceeds');
  });
  it('fails explicitly on negative wage bases and negative net pay', () => {
    const deduction: PayrollComponent = {
      ...salary,
      code: 'DEDUCTION',
      kind: 'DEDUCTION',
      amount: '7000',
      source: { type: 'ADJUSTMENT', id: 'adjustment-1' },
    };
    expect(() => payrollBases([salary, deduction])).toThrow(
      'cannot be negative',
    );
    expect(() =>
      payrollTotals(
        [salary, { ...deduction, affectsGross: false, statutoryBases: [] }],
        [],
      ),
    ).toThrow('exceed payable');
  });
  it('rejects fractional-cent inputs and invalid basis flags', () => {
    expect(() => payrollBases([{ ...salary, amount: '1.001' }])).toThrow(
      'two decimal',
    );
    expect(() =>
      payrollBases([{ ...salary, statutoryBases: ['EPF', 'EPF'] }]),
    ).toThrow('unique');
  });
  it('copies component metadata rather than changing the input', () => {
    const result = payrollBases([salary]);
    result.lines[0].source.id = 'changed';
    result.lines[0].statutoryBases.length = 0;
    expect(salary.source.id).toBe('salary-1');
    expect(salary.statutoryBases).toHaveLength(6);
  });
});
