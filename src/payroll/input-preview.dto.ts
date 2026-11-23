import { ApiProperty } from '@nestjs/swagger';
import { StatutoryScheme } from '@prisma/client';

class SourceDto {
  @ApiProperty({
    enum: [
      'SALARY',
      'UNPAID_LEAVE',
      'MANUAL',
      'CLAIM',
      'COMMISSION',
      'OVERTIME',
    ],
  })
  type: string;
  @ApiProperty() id: string;
}
class DefinitionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'date' }) effectiveFrom: string;
}
class InputLineDto {
  @ApiProperty({
    enum: [
      'NORMAL',
      'ADDITIONAL',
      'EXCLUDED',
      'EXCLUDED_NORMAL',
      'EXCLUDED_ADDITIONAL',
      'UNCLASSIFIED',
    ],
  })
  pcbTreatment: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: ['EARNING', 'DEDUCTION'] }) kind: string;
  @ApiProperty({ example: '100.00' }) amount: string;
  @ApiProperty({ example: '-100.00' }) signedAmount: string;
  @ApiProperty() affectsGross: boolean;
  @ApiProperty() affectsNet: boolean;
  @ApiProperty({ enum: StatutoryScheme, isArray: true })
  statutoryBases: StatutoryScheme[];
  @ApiProperty({ type: SourceDto }) source: SourceDto;
  @ApiProperty({ type: DefinitionDto }) definition: DefinitionDto;
}
class ManualSourceDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'uuid' }) createdBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class InputPreviewDataDto {
  @ApiProperty({
    type: 'object',
    properties: {
      includeBasicSalary: { type: 'boolean' },
      includeOvertime: { type: 'boolean' },
      includeClaimsAndAllowance: { type: 'boolean' },
      includeBonus: { type: 'boolean' },
      includeCommissionAndIncentives: { type: 'boolean' },
      includeEpf: { type: 'boolean' },
      includeSocso: { type: 'boolean' },
      includeEis: { type: 'boolean' },
      includePcb: { type: 'boolean' },
      includeHrdCorpLevy: { type: 'boolean' },
      salaryProrationMethod: { type: 'string' },
    },
    description:
      'Resolved payroll settings used for this preview. Missing settings use the documented defaults.',
  })
  payrollSettings: Record<string, unknown>;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        planCode: { type: 'string' },
        planName: { type: 'string', nullable: true },
        payrollEarningCode: { type: 'string' },
        amount: { type: 'string' },
        referenceId: { type: 'string', nullable: true },
      },
    },
    description:
      'Allocated ready commission records; amounts and plan labels come from saved records, not current plan settings.',
  })
  commissionSources: Record<string, unknown>[];
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        date: { type: 'string', format: 'date' },
        earningCode: { type: 'string' },
        minutes: { type: 'integer' },
        amount: { type: 'string' },
        multiplier: { type: 'string' },
        calculationBasis: { type: 'string' },
      },
    },
    description:
      'Allocated approved overtime requests calculated from the saved employee basis and payroll working-hour policy.',
  })
  overtimeSources: Record<string, unknown>[];
  @ApiProperty() year: number;
  @ApiProperty() month: number;
  @ApiProperty({
    nullable: true,
    description:
      'Effective payroll profile PCB category. Standard calculation supports RESIDENT/NON_RESIDENT.',
  })
  pcbCategory: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Current-employer YTD from prior PAID run taxPeriod snapshots only. Contains ready, totals, source rows and blocking issues. Totals exclude previous-employer taxOpening and are incomplete when ready is false. Missing months are not presumed zero.',
  })
  taxYtd: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    nullable: true,
    properties: {
      normalEpf: { type: 'string', example: '264.00' },
      additionalEpf: { type: 'string', example: '51.00' },
      totalEmployeeEpf: { type: 'string', example: '315.00' },
      trace: { type: 'object', additionalProperties: true },
    },
    description:
      'Normal/additional employee EPF allocation with contribution and source traces, including EPF on tax-exempt payments.',
  })
  epfAllocation: Record<string, unknown> | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    properties: { code: { type: 'string' }, message: { type: 'string' } },
  })
  epfAllocationIssue: Record<string, string> | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'Applicable reviewed cumulative TP1 expense declaration. Null means not recorded; values are not final allowed deductions.',
  })
  taxExpenses: Record<string, unknown> | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'Latest effective reviewed family declaration and calculated family-only reliefs. Excludes EPF and TP1 deductions.',
  })
  taxFamily: Record<string, unknown> | null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'Latest effective reviewed previous-employer totals with revision and evidence reference. Null means not recorded; current-employer YTD is not included.',
  })
  taxOpening: Record<string, unknown> | null;
  @ApiProperty({
    type: 'object',
    properties: {
      normal: { type: 'string' },
      additional: { type: 'string' },
      unclassified: { type: 'string' },
    },
  })
  pcbRemuneration: Record<string, string>;
  @ApiProperty({
    type: 'object',
    properties: {
      profileId: { type: 'string', nullable: true, format: 'uuid' },
      profileRevision: { type: 'integer', nullable: true },
      nonPcbReady: {
        type: 'boolean',
        description:
          'All five non-PCB schemes resolved successfully; does not certify eligibility or payroll readiness.',
      },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            scheme: { type: 'string', enum: Object.values(StatutoryScheme) },
          },
        },
      },
      contributions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            scheme: { type: 'string', enum: Object.values(StatutoryScheme) },
            category: { type: 'string' },
            rulesetId: { type: 'string', format: 'uuid' },
            version: { type: 'string' },
            profileId: { type: 'string', format: 'uuid' },
            profileRevision: { type: 'integer' },
            sourceUrl: { type: 'string' },
            sourceSha256: { type: 'string' },
            effectiveFrom: { type: 'string', format: 'date' },
            effectiveTo: { type: 'string', format: 'date', nullable: true },
            parameters: { type: 'object', additionalProperties: true },
            result: { type: 'object', additionalProperties: true },
            employeeDeduction: { type: 'string' },
            employerCost: { type: 'string' },
            employerRounding: { type: 'string' },
            remittance: { type: 'string' },
          },
        },
      },
    },
  })
  contributionPreview: Record<string, unknown>;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        description: { type: 'string' },
        date: { type: 'string', format: 'date' },
      },
    },
  })
  claimSources: { id: string; description: string; date: string }[];
  @ApiProperty({ format: 'uuid' }) runId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty({ example: '3100.00' }) gross: string;
  @ApiProperty() earnings: string;
  @ApiProperty() componentDeductions: string;
  @ApiProperty({
    description: 'Pay before statutory employee deductions; not final net pay.',
  })
  netBeforeStatutory: string;
  @ApiProperty({
    type: 'object',
    properties: Object.fromEntries(
      Object.values(StatutoryScheme).map((s) => [
        s,
        { type: 'string', example: '3100.00' },
      ]),
    ),
  })
  bases: Record<string, string>;
  @ApiProperty({ type: [InputLineDto] }) lines: InputLineDto[];
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Salary method/version, period, divisor, employed days, rate segments, rounding policy and approved unpaid source dates.',
  })
  salaryTrace: Record<string, unknown>;
  @ApiProperty({ type: [ManualSourceDto] }) manualSources: ManualSourceDto[];
  @ApiProperty({ enum: [false] }) complete: boolean;
  @ApiProperty({ type: [String] }) limitations: string[];
}
export class InputPreviewResponseDto {
  @ApiProperty({ type: InputPreviewDataDto }) data: InputPreviewDataDto;
}
