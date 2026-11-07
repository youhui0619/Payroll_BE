import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { Roles } from '../auth/auth.module';
import { calculatePcb, PcbInput, PCB_SOURCE_SHA256 } from './pcb-calculator';
import { calculateTp1Reliefs } from './tp1-reliefs';
import { Tp1PreviewDto, Tp1PreviewResponseDto } from './tp1.dto';

export class PcbPreviewDto implements PcbInput {
  @ApiProperty({ enum: [2026] }) @IsIn([2026]) year: number;
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
  @ApiProperty({ enum: ['RESIDENT', 'NON_RESIDENT'] })
  @IsIn(['RESIDENT', 'NON_RESIDENT'])
  residency: 'RESIDENT' | 'NON_RESIDENT';
  @ApiProperty({ enum: [1, 2, 3] }) @IsIn([1, 2, 3]) category: 1 | 2 | 3;
  @ApiProperty({
    example: '5500.00',
    description: 'Current normal taxable remuneration after exemptions.',
  })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  normal: string;
  @ApiProperty({ example: '0.00' })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  additional: string;
  @ApiProperty({ example: '605.00' })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  normalEpf: string;
  @ApiProperty({ example: '0.00' })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  additionalEpf: string;
  @ApiProperty({
    example: '0.00',
    description: 'Prior taxable income this year, including TP3.',
  })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  accumulatedIncome: string;
  @ApiProperty({ example: '0.00' })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  accumulatedEpf: string;
  @ApiProperty({
    example: '0.00',
    description:
      'Prior MTD, excluding CP38 and voluntary additional withholding.',
  })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  accumulatedMtd: string;
  @ApiProperty({ example: '0.00' })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  accumulatedZakat: string;
  @ApiProperty({ example: '0.00' })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  currentZakat: string;
  @ApiProperty({
    example: '15000.00',
    description:
      'Already verified D+S+DU+SU+QC+LP, excluding EPF. Preview does not validate TP1/TP3 or relief eligibility.',
  })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  qualifyingReliefs: string;
}
class PcbPreviewDataDto {
  @ApiProperty() amount: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) trace: Record<
    string,
    unknown
  >;
  @ApiProperty() sourceSha256: string;
  @ApiProperty({ enum: ['ORIGINAL_PDF'] }) checksumKind: string;
  @ApiProperty({ type: [String] }) limitations: string[];
}
class PcbPreviewResponseDto {
  @ApiProperty({ type: PcbPreviewDataDto }) data: PcbPreviewDataDto;
}
@ApiBearerAuth()
@ApiTags('statutory-rules')
@Roles('OWNER', 'FINANCE')
@Controller('statutory/pcb')
export class PcbController {
  @Post('tp1-preview')
  @ApiOperation({
    summary:
      'Preview 2026 cumulative TP1 expense deductions and shared annual caps',
    description:
      'Requires reviewed eligible amounts and existing spouse/mandatory-EPF deduction context. Does not verify receipts or recurring eligibility, save claims, or calculate D1 rebates.',
  })
  @ApiCreatedResponse({ type: Tp1PreviewResponseDto })
  tp1Preview(@Body() input: Tp1PreviewDto) {
    return { data: calculateTp1Reliefs(input) };
  }
  @Post('preview')
  @ApiOperation({
    summary: 'Preview 2026 standard PCB from normalized inputs',
    description:
      'Read-only calculation. No employee records or payroll totals are changed. Special tax regimes and relief eligibility resolution remain pending.',
  })
  @ApiCreatedResponse({ type: PcbPreviewResponseDto })
  preview(@Body() input: PcbPreviewDto) {
    return {
      data: {
        ...calculatePcb(input),
        sourceSha256: PCB_SOURCE_SHA256,
        checksumKind: 'ORIGINAL_PDF',
        limitations: [
          'Standard resident/non-resident formula only; REP, knowledge-worker and C-suite regimes are not supported.',
          'Input exemptions, relief eligibility and TP1/TP3 reconciliation must be verified separately.',
          'Worked examples pass; full LHDN conformance and approval remain pending.',
        ],
      },
    };
  }
}
