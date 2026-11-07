import {
  EmployeePayrollProfileVersion,
  StatutoryRuleset,
} from '@prisma/client';
import { resolveContributions } from './contribution-resolver';
const profile = {
  id: 'profile',
  revision: 1,
  companyId: 'company',
  employeeId: 'employee',
  effectiveFrom: new Date('2026-06-01'),
  epfCategory: 'DEFAULT',
  socsoCategory: 'DEFAULT',
  eisCategory: 'DEFAULT',
  lindungCategory: 'DEFAULT',
  hrdCategory: 'DEFAULT',
  lindungParticipation: 'ENROLLED',
} as EmployeePayrollProfileVersion;
const rules = ['EPF', 'SOCSO', 'EIS', 'LINDUNG_24_JAM', 'HRD'].map(
  (scheme) =>
    ({
      id: scheme,
      createdAt: new Date('2026-06-01'),
      companyId: 'company',
      scheme,
      category: 'DEFAULT',
      version: 'v1',
      active: true,
      effectiveFrom: new Date('2026-06-01'),
      effectiveTo: null,
      sourceUrl: 'https://example.test',
      sourceSha256: 'hash',
      parameters: {
        kind: 'RATE',
        employeeRate: '0.02',
        employerRate: '0.02',
        rounding: 'TOTAL_WHOLE_UP',
      },
    }) as StatutoryRuleset,
);
const base = {
  companyId: 'company',
  employeeId: 'employee',
  year: 2026,
  month: 6,
  bases: {
    EPF: '6710',
    SOCSO: '0',
    EIS: '0',
    LINDUNG_24_JAM: '0',
    HRD: '0',
    PCB: '6710',
  },
  profiles: [profile],
  rulesets: rules,
};
describe('effective payroll contribution resolution', () => {
  it('calculates all five schemes with employer rounding and reproducible references', () => {
    const resolved = resolveContributions(base);
    expect(resolved.nonPcbReady).toBe(true);
    expect(resolved.contributions).toHaveLength(5);
    expect(resolved.contributions[0]).toMatchObject({
      employeeDeduction: '134.20',
      employerCost: '134.80',
      employerRounding: '0.60',
      remittance: '269.00',
      rulesetId: 'EPF',
      profileId: 'profile',
      sourceSha256: 'hash',
    });
    expect(resolved.contributions[0].parameters).not.toBe(rules[0].parameters);
  });
  it('selects the latest effective profile revision without using future profiles', () => {
    const resolved = resolveContributions({
      ...base,
      profiles: [
        profile,
        { ...profile, id: 'correction', revision: 2 },
        {
          ...profile,
          id: 'future',
          revision: 3,
          effectiveFrom: new Date('2026-07-01'),
        },
      ],
    });
    expect(resolved.profileId).toBe('correction');
  });
  it('reports missing and partial-month coverage instead of assuming zero', () => {
    const resolved = resolveContributions({
      ...base,
      rulesets: rules
        .map((r) =>
          r.scheme === 'EPF'
            ? { ...r, effectiveTo: new Date('2026-06-15') }
            : r,
        )
        .filter((r) => r.scheme !== 'HRD'),
    });
    expect(resolved.nonPcbReady).toBe(false);
    expect(resolved.issues.map((i) => i.scheme)).toEqual(['EPF', 'HRD']);
    expect(resolved.contributions.some((c) => c.scheme === 'EPF')).toBe(false);
  });
  it('rejects overlapping rules even where one covers the whole month', () => {
    expect(
      resolveContributions({
        ...base,
        rulesets: [
          ...rules,
          { ...rules[0], id: 'overlap', effectiveFrom: new Date('2026-06-15') },
        ],
      }).issues[0].code,
    ).toBe('STATUTORY_RULESET_REQUIRED');
  });
  it('requires an exemption for excluded LINDUNG participation', () => {
    const excluded = { ...profile, lindungParticipation: 'OPTED_OUT' };
    expect(
      resolveContributions({ ...base, profiles: [excluded] }).issues[0].code,
    ).toBe('LINDUNG_PARTICIPATION_MISMATCH');
    expect(
      resolveContributions({
        ...base,
        profiles: [excluded],
        rulesets: rules.map((r) =>
          r.scheme === 'LINDUNG_24_JAM'
            ? {
                ...r,
                parameters: { kind: 'EXEMPT', reason: 'Recorded opt-out' },
              }
            : r,
        ),
      }).nonPcbReady,
    ).toBe(true);
  });
  it('rejects tenant leakage and reports missing profiles', () => {
    expect(() =>
      resolveContributions({
        ...base,
        profiles: [{ ...profile, companyId: 'other' }],
      }),
    ).toThrow();
    expect(() =>
      resolveContributions({
        ...base,
        rulesets: [{ ...rules[0], companyId: 'other' }],
      }),
    ).toThrow();
    expect(resolveContributions({ ...base, profiles: [] }).issues[0].code).toBe(
      'PAYROLL_PROFILE_REQUIRED',
    );
  });
});
