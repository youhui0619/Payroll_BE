import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import { InputPreviewDataDto } from './input-preview.dto';

export class CalculationPreviewDto {
  @ApiProperty({
    enum: ['STANDARD'],
    description:
      'Explicit confirmation of the supported standard tax regime. REP, knowledge-worker and C-suite regimes are not supported by this endpoint.',
  })
  @IsIn(['STANDARD'])
  taxRegime: 'STANDARD';

  @ApiProperty({
    example: '0.00',
    description:
      'Reviewed current-month zakat credit for PCB. This is a tax rebate input, not an additional take-home-pay deduction. Record any salary-withheld zakat separately as a net-only deduction component.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  currentZakat: string;

  @ApiProperty({
    description:
      'Review/evidence reference, including an explicit zero declaration when no zakat is claimed.',
  })
  @IsString()
  @Length(1, 1000)
  zakatEvidence: string;
}

class CalculationPreviewDataDto {
  @ApiProperty({ type: InputPreviewDataDto }) input: InputPreviewDataDto;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    properties: {
      amount: { type: 'string', example: '110.00' },
      sourceSha256: { type: 'string' },
      trace: { type: 'object', additionalProperties: true },
      reliefTrace: { type: 'object', additionalProperties: true },
    },
  })
  pcb: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    properties: {
      gross: { type: 'string', example: '5500.00' },
      deductions: { type: 'string', example: '715.00' },
      net: { type: 'string', example: '4785.00' },
      employeeContributions: { type: 'string' },
      employerContributions: { type: 'string' },
      employerRounding: { type: 'string' },
      statutory: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
      },
      lines: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
      },
    },
    description:
      'Decimal-string totals for resolved inputs only; statutory rows retain scheme, version and calculation trace.',
  })
  totals: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    properties: {
      version: { type: 'integer', enum: [1] },
      companyId: { type: 'string', format: 'uuid' },
      employeeId: { type: 'string', format: 'uuid' },
      runId: { type: 'string', format: 'uuid' },
      year: { type: 'integer' },
      month: { type: 'integer' },
      taxableIncome: { type: 'string' },
      employeeEpf: { type: 'string' },
      mtd: { type: 'string' },
      zakat: { type: 'string' },
    },
    description:
      'Unsaved period-only tax snapshot candidate, excluding previous-employer or accumulated amounts.',
  })
  taxPeriod: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    properties: {
      taxRegime: { type: 'string', enum: ['STANDARD'] },
      currentZakat: { type: 'string' },
      zakatEvidence: { type: 'string' },
      reviewedBy: { type: 'string', format: 'uuid' },
    },
  })
  taxReview: Record<string, unknown>;
  @ApiProperty({ enum: [true] }) previewOnly: boolean;
  @ApiProperty({ enum: [false] }) complete: boolean;
  @ApiProperty({ type: [String] }) limitations: string[];
}

export class CalculationPreviewResponseDto {
  @ApiProperty({
    type: CalculationPreviewDataDto,
    description:
      'No rows/status changes are saved; automatic overtime/recurring source collection remains pending.',
  })
  data: CalculationPreviewDataDto;
}
