import {
  CommissionPayrollRecord,
  PayrollComponentDefinition,
  PayrollInput,
  Prisma,
} from '@prisma/client';
import {
  assemblePayrollInputs,
  calculateOvertimeAmount,
} from './input-assembly';
const definition = (code: string, kind = 'EARNING') =>
  ({
    id: code,
    companyId: 'company',
    code,
    name: code,
    kind,
    revision: 1,
    effectiveFrom: new Date('2026-01-01'),
    active: true,
    affectsGross: true,
    affectsNet: true,
    statutoryBases: ['EPF'],
    reason: 'Setup',
    recordedBy: 'owner',
    createdAt: new Date('2026-01-01'),
  }) as PayrollComponentDefinition;
const manual = {
  id: 'input',
  companyId: 'company',
  runId: 'run',
  employeeId: 'employee',
  componentCode: 'BONUS',
  amount: new Prisma.Decimal(200),
  reason: 'Performance',
  createdBy: 'owner',
  createdAt: new Date('2026-01-01'),
  voidedAt: null,
} as PayrollInput;
const base = {
  companyId: 'company',
  runId: 'run',
  employeeId: 'employee',
  salary: {
    year: 2026,
    month: 1,
    joinedDate: '2026-01-01',
    salaries: [{ id: 'salary', amount: '3100', effectiveFrom: '2026-01-01' }],
    unpaidDays: [{ date: '2026-01-02', days: '1' as const, sourceId: 'leave' }],
  },
  definitions: [
    definition('BASIC'),
    definition('UNPAID_LEAVE', 'DEDUCTION'),
    definition('BONUS'),
    definition('OT'),
  ],
  manualInputs: [manual],
};
describe('payroll input assembly', () => {
  const commission = {
    id: 'commission',
    companyId: 'company',
    employeeId: 'employee',
    payrollRunId: 'run',
    status: 'READY_FOR_PAYROLL',
    payrollEarningCode: 'BONUS',
    payoutTiming: 'CURRENT_PAYROLL',
    createdDate: new Date('2026-01-01'),
    amount: new Prisma.Decimal(200),
    planCode: 'SALES',
    planName: 'Saved plan',
    referenceId: 'sale-1',
  } as CommissionPayrollRecord;
  it('adds the saved commission amount and source exactly once', () => {
    const result = assemblePayrollInputs({
      ...base,
      commissions: [commission],
    });
    expect(result.gross).toBe('3400.00');
    expect(result.commissionSources[0]).toMatchObject({
      id: 'commission',
      amount: '200.00',
      planName: 'Saved plan',
    });
    expect(result.lines.at(-1).source).toEqual({
      type: 'COMMISSION',
      id: 'commission',
    });
    expect(() =>
      assemblePayrollInputs({ ...base, commissions: [commission, commission] }),
    ).toThrow();
  });
  it('calculates approved overtime from the employee hourly basis and saved multiplier', () => {
    const result = assemblePayrollInputs({
      ...base,
      overtime: [
        {
          id: 'overtime',
          companyId: 'company',
          employeeId: 'employee',
          status: 'APPROVED',
          overtimeDate: new Date('2026-01-03'),
          netMinutes: 150,
          hourlyRateMultiplier: new Prisma.Decimal('1.5'),
          earningCode: 'OT',
        },
      ],
      employeeOvertime: {
        includeOvertime: true,
        overtimeCalculationBasis: 'HOURLY_RATE',
        overtimeHourlyRate: new Prisma.Decimal('20'),
      },
      overtimeSettings: {
        includeOvertime: true,
        standardWorkingHoursPerDay: new Prisma.Decimal('8'),
        salaryProrationMethod: 'FIXED_26_DAYS',
      },
    });
    expect(result.gross).toBe('3275.00');
    expect(result.overtimeSources).toEqual([
      expect.objectContaining({
        id: 'overtime',
        amount: '75.00',
        minutes: 150,
      }),
    ]);
    expect(result.lines.at(-1).source).toEqual({
      type: 'OVERTIME',
      id: 'overtime',
    });
  });
  it('converts monthly salary to an hourly overtime rate with currency rounding', () => {
    expect(
      calculateOvertimeAmount({
        year: 2026,
        month: 1,
        overtimeDate: new Date('2026-01-03'),
        netMinutes: 60,
        multiplier: '1.5',
        basis: 'MONTHLY_SALARY_CONVERTED',
        hourlyRate: null,
        standardWorkingHoursPerDay: '8',
        salaryProrationMethod: 'FIXED_26_DAYS',
        salaries: [{ amount: '3100.00', effectiveFrom: '2026-01-01' }],
      }),
    ).toBe('22.36');
  });
  it.each([
    { companyId: 'foreign' },
    { employeeId: 'foreign' },
    { payrollRunId: 'foreign' },
    { status: 'PAID' },
    { status: 'PENDING_APPROVAL' },
    { payoutTiming: 'SEPARATE_PAYOUT' },
    { payoutTiming: 'NEXT_PAYROLL' },
    { payrollEarningCode: 'BASIC' },
  ])('rejects ineligible commission %j', (change) => {
    expect(() =>
      assemblePayrollInputs({
        ...base,
        commissions: [{ ...commission, ...change }],
      }),
    ).toThrow();
  });
  it('combines salary, frozen unpaid dates and manual amounts with source traces', () => {
    const result = assemblePayrollInputs(base);
    expect(result.gross).toBe('3200.00');
    expect(result.netBeforeStatutory).toBe('3200.00');
    expect(result.bases.EPF).toBe('3200.00');
    expect(result.lines.map((l) => l.source.type)).toEqual([
      'SALARY',
      'UNPAID_LEAVE',
      'MANUAL',
    ]);
    expect(result.salaryTrace.unpaidSources[0].sourceId).toBe('leave');
    expect(result.manualSources[0].reason).toBe('Performance');
  });
  it('resolves effective revisions, ignores future changes and rejects archived definitions', () => {
    expect(
      assemblePayrollInputs({
        ...base,
        definitions: [
          ...base.definitions,
          {
            ...definition('BONUS'),
            revision: 2,
            effectiveFrom: new Date('2026-02-01'),
            active: false,
          },
        ],
      }).gross,
    ).toBe('3200.00');
    expect(() =>
      assemblePayrollInputs({
        ...base,
        definitions: [
          ...base.definitions,
          { ...definition('BONUS'), revision: 2, active: false },
        ],
      }),
    ).toThrow();
  });
  it('omits voided inputs while preserving valid source scope', () => {
    expect(
      assemblePayrollInputs({
        ...base,
        manualInputs: [{ ...manual, voidedAt: new Date() }],
      }).gross,
    ).toBe('3000.00');
    for (const change of [
      { companyId: 'other' },
      { employeeId: 'other' },
      { runId: 'other' },
    ])
      expect(() =>
        assemblePayrollInputs({
          ...base,
          manualInputs: [{ ...manual, ...change }],
        }),
      ).toThrow();
  });
  it('rejects repeated sources and manual use of generated codes', () => {
    expect(() =>
      assemblePayrollInputs({ ...base, manualInputs: [manual, manual] }),
    ).toThrow();
    expect(() =>
      assemblePayrollInputs({
        ...base,
        manualInputs: [{ ...manual, componentCode: 'BASIC' }],
      }),
    ).toThrow();
  });
  it('rejects foreign definitions and unpaid flags that disagree with salary', () => {
    expect(() =>
      assemblePayrollInputs({
        ...base,
        definitions: [
          ...base.definitions,
          { ...definition('OTHER'), companyId: 'foreign' },
        ],
      }),
    ).toThrow();
    expect(() =>
      assemblePayrollInputs({
        ...base,
        definitions: base.definitions.map((d) =>
          d.code === 'UNPAID_LEAVE' ? { ...d, statutoryBases: [] } : d,
        ),
      }),
    ).toThrow();
  });

  it('honours earning inclusion switches and rejects already allocated disabled sources', () => {
    const noBasic = assemblePayrollInputs({
      ...base,
      payrollSettings: {
        includeBasicSalary: false,
        includeOvertime: true,
        includeClaimsAndAllowance: true,
        includeBonus: true,
        includeCommissionAndIncentives: true,
        includeEpf: true,
        includeSocso: true,
        includeEis: true,
        includePcb: true,
        includeHrdCorpLevy: false,
        salaryProrationMethod: 'CALENDAR_DAYS',
      },
    });
    expect(noBasic.gross).toBe('200.00');
    expect(noBasic.lines.map((line) => line.code)).toEqual(['BONUS']);
    expect(() =>
      assemblePayrollInputs({
        ...base,
        payrollSettings: {
          includeBasicSalary: true,
          includeOvertime: true,
          includeClaimsAndAllowance: false,
          includeBonus: true,
          includeCommissionAndIncentives: true,
          includeEpf: true,
          includeSocso: true,
          includeEis: true,
          includePcb: true,
          includeHrdCorpLevy: false,
          salaryProrationMethod: 'CALENDAR_DAYS',
        },
        claims: [
          {
            id: 'claim',
            companyId: 'company',
            employeeId: 'employee',
            payrollRunId: 'run',
            status: 'APPROVED',
            paymentMethod: 'PAYROLL',
            payrollComponentCode: 'BONUS',
            amount: new Prisma.Decimal(10),
            description: 'Taxi',
            date: new Date('2026-01-02'),
          } as any,
        ],
      }),
    ).toThrow();
  });
});
