import { resolveTaxYtd, TaxPeriodSnapshot } from './tax-ytd';
const period: TaxPeriodSnapshot = {
  version: 1,
  companyId: 'company',
  employeeId: 'employee',
  runId: 'jan',
  year: 2026,
  month: 1,
  taxableIncome: '5000.10',
  employeeEpf: '550',
  mtd: '100.05',
  zakat: '10',
};
const run = {
  id: 'jan',
  companyId: 'company',
  year: 2026,
  month: 1,
  status: 'PAID',
  employees: [
    {
      id: 'row',
      companyId: 'company',
      employeeId: 'employee',
      snapshot: { taxPeriod: period },
    },
  ],
};
const base = {
  companyId: 'company',
  employeeId: 'employee',
  year: 2026,
  month: 2,
  joinedDate: new Date('2020-01-01'),
  runs: [run],
};
describe('current-employer tax YTD', () => {
  it('uses period tax values rather than gross/net or previous-employer values', () => {
    const result = resolveTaxYtd(base);
    expect(result.ready).toBe(true);
    expect(result.totals).toEqual({
      taxableIncome: '5000.10',
      employeeEpf: '550.00',
      mtd: '100.05',
      zakat: '10.00',
    });
    expect(result.sources[0].payrollEmployeeId).toBe('row');
  });
  it('requires missing employment months rather than defaulting to zero', () => {
    expect(resolveTaxYtd({ ...base, month: 3 }).issues).toEqual([
      expect.objectContaining({ code: 'PAYROLL_YTD_MONTH_REQUIRED', month: 2 }),
    ]);
    expect(
      resolveTaxYtd({ ...base, joinedDate: new Date('2026-02-15'), runs: [] }),
    ).toMatchObject({ ready: true, totals: { taxableIncome: '0.00' } });
  });
  it.each(['DRAFT', 'CALCULATED', 'APPROVED', 'PUBLISHED'])(
    'does not count an unsettled %s run',
    (status) => {
      expect(
        resolveTaxYtd({ ...base, runs: [{ ...run, status }] }),
      ).toMatchObject({
        ready: false,
        totals: { mtd: '0.00' },
        issues: [{ code: 'PAYROLL_YTD_UNSETTLED' }],
      });
    },
  );
  it('ignores other companies, years, current and future months', () => {
    const result = resolveTaxYtd({
      ...base,
      runs: [
        run,
        { ...run, companyId: 'other' },
        { ...run, year: 2025 },
        { ...run, month: 2 },
        { ...run, month: 3 },
      ],
    });
    expect(result.ready).toBe(true);
    expect(result.sources).toHaveLength(1);
  });
  it('rejects ambiguous duplicate months and missing employee rows', () => {
    expect(resolveTaxYtd({ ...base, runs: [run, run] }).ready).toBe(false);
    expect(
      resolveTaxYtd({ ...base, runs: [{ ...run, employees: [] }] }).issues[0]
        .code,
    ).toBe('PAYROLL_YTD_EMPLOYEE_REQUIRED');
  });
  it.each([
    { version: 2 },
    { companyId: 'other' },
    { employeeId: 'other' },
    { runId: 'other' },
    { month: 2 },
    { mtd: '-1' },
    { mtd: '1.001' },
    { mtd: 100 },
    { mtd: 'NaN' },
  ])('rejects invalid snapshot %j', (change) => {
    const result = resolveTaxYtd({
      ...base,
      runs: [
        {
          ...run,
          employees: [
            {
              ...run.employees[0],
              snapshot: { taxPeriod: { ...period, ...change } },
            },
          ],
        },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.issues[0].code).toBe('PAYROLL_YTD_SNAPSHOT_INVALID');
  });
  it('resets in January without including last year', () => {
    expect(resolveTaxYtd({ ...base, month: 1 })).toMatchObject({
      ready: true,
      totals: { mtd: '0.00' },
      sources: [],
    });
  });
});
