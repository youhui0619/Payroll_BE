import {
  EmployeePayrollProfileVersion,
  Prisma,
  StatutoryRuleset,
  StatutoryScheme,
} from '@prisma/client';
import { HttpException } from '@nestjs/common';
import { fail } from '../common/domain';
import { calculateContribution, validateRules } from './calculator';

const fields = {
  EPF: 'epfCategory',
  SOCSO: 'socsoCategory',
  EIS: 'eisCategory',
  LINDUNG_24_JAM: 'lindungCategory',
  HRD: 'hrdCategory',
} as const;
export function resolveContributions(input: {
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
  bases: Record<StatutoryScheme, string>;
  profiles: readonly EmployeePayrollProfileVersion[];
  rulesets: readonly StatutoryRuleset[];
}) {
  if (
    !Number.isInteger(input.year) ||
    input.year < 2000 ||
    input.year > 2200 ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  )
    fail(
      'INVALID_PAYROLL_PERIOD',
      'Provide a valid payroll year and month.',
      400,
    );
  const start = new Date(Date.UTC(input.year, input.month - 1, 1));
  const end = new Date(Date.UTC(input.year, input.month, 0));
  if (
    input.profiles.some(
      (p) =>
        p.companyId !== input.companyId || p.employeeId !== input.employeeId,
    ) ||
    input.rulesets.some((r) => r.companyId !== input.companyId)
  )
    fail(
      'STATUTORY_SOURCE_SCOPE_MISMATCH',
      'Statutory inputs must belong to the employee and company.',
    );
  const profile = input.profiles
    .filter((p) => p.effectiveFrom <= start)
    .sort(
      (a, b) =>
        b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
        b.revision - a.revision,
    )[0];
  const issues: { code: string; message: string; scheme?: StatutoryScheme }[] =
    [];
  const contributions = [];
  if (!profile)
    issues.push({
      code: 'PAYROLL_PROFILE_REQUIRED',
      message: 'Record statutory categories effective for this salary month.',
    });
  else
    for (const scheme of Object.keys(fields) as (keyof typeof fields)[]) {
      const matching = input.rulesets.filter(
        (r) =>
          r.active &&
          r.scheme === scheme &&
          r.category === profile[fields[scheme]] &&
          r.effectiveFrom <= end &&
          (!r.effectiveTo || r.effectiveTo >= start),
      );
      if (
        matching.length !== 1 ||
        matching[0].effectiveFrom > start ||
        (matching[0].effectiveTo && matching[0].effectiveTo < end)
      ) {
        issues.push({
          code: 'STATUTORY_RULESET_REQUIRED',
          scheme,
          message:
            'Exactly one active category ruleset must cover the entire salary month.',
        });
        continue;
      }
      const rule = matching[0];
      try {
        const parameters = validateRules(rule.parameters);
        if (scheme === 'LINDUNG_24_JAM') {
          const excluded = ['OPTED_OUT', 'NOT_ELIGIBLE'].includes(
            profile.lindungParticipation,
          );
          if (
            !['OPTED_OUT', 'NOT_ELIGIBLE', 'MANDATORY', 'ENROLLED'].includes(
              profile.lindungParticipation,
            ) ||
            excluded !== (parameters.kind === 'EXEMPT')
          )
            fail(
              'LINDUNG_PARTICIPATION_MISMATCH',
              'LINDUNG participation and the selected exemption/contribution disagree.',
            );
        }
        const result = calculateContribution(
          input.bases[scheme],
          rule.parameters,
        );
        const rounding = new Prisma.Decimal(result.remittanceRounding ?? '0');
        const employerCost = new Prisma.Decimal(result.employer).plus(rounding);
        const remittance = new Prisma.Decimal(result.employee).plus(
          employerCost,
        );
        if (
          employerCost.lt(0) ||
          (result.total !== undefined && !remittance.equals(result.total))
        )
          fail(
            'STATUTORY_TOTAL_MISMATCH',
            'Contribution shares and remittance do not reconcile.',
          );
        contributions.push({
          scheme,
          category: rule.category,
          rulesetId: rule.id,
          version: rule.version,
          profileId: profile.id,
          profileRevision: profile.revision,
          sourceUrl: rule.sourceUrl,
          sourceSha256: rule.sourceSha256,
          effectiveFrom: rule.effectiveFrom.toISOString().slice(0, 10),
          effectiveTo: rule.effectiveTo?.toISOString().slice(0, 10) ?? null,
          parameters: structuredClone(rule.parameters),
          result: {
            ...result,
            trace: { ...result.trace, roundingAllocation: 'EMPLOYER' },
          },
          employeeDeduction: result.employee,
          employerCost: employerCost.toFixed(2),
          employerRounding: rounding.toFixed(2),
          remittance: remittance.toFixed(2),
        });
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const response = error.getResponse() as {
          code?: string;
          message?: string;
        };
        issues.push({
          scheme,
          code: response.code ?? 'STATUTORY_CALCULATION_FAILED',
          message: response.message ?? 'Statutory calculation failed.',
        });
      }
    }
  return {
    profileId: profile?.id ?? null,
    profileRevision: profile?.revision ?? null,
    nonPcbReady: issues.length === 0,
    contributions,
    issues,
  };
}
