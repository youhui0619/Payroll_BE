import {
  PayrollComponentDefinition,
  PayrollInput,
  Prisma,
} from '@prisma/client';
import { assemblePayrollInputs } from './input-assembly';
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
  ],
  manualInputs: [manual],
};
describe('payroll input assembly', () => {
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
});
