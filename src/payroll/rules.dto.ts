import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from 'class-validator';
import { StatutoryScheme } from '@prisma/client';
import { Transform } from 'class-transformer';
import { emptyStringAsUndefined } from '../common/transformers';

export class CatalogItemDto {
  @ApiProperty() key: string;
  @ApiProperty({ enum: StatutoryScheme }) scheme: StatutoryScheme;
  @ApiProperty() category: string;
  @ApiProperty() version: string;
  @ApiProperty({ format: 'date' }) effectiveFrom: string;
  @ApiPropertyOptional({ format: 'date' }) effectiveTo?: string;
  @ApiProperty() sourceUrl: string;
  @ApiProperty() sourceSha256: string;
  @ApiProperty({ enum: ['ORIGINAL_PDF', 'EXTRACTED_DATA'] })
  checksumKind: string;
  @ApiProperty() sourceArtifact: string;
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  supportingSources?: Record<string, string>[];
  @ApiProperty({ type: [String] }) limitations: string[];
  @ApiProperty({ enum: ['TABLE', 'RATE', 'EXEMPT'] }) calculator: string;
  @ApiProperty() bandCount: number;
}
export class CatalogResponseDto {
  @ApiProperty({ type: [CatalogItemDto] }) data: CatalogItemDto[];
}
export class RulesDto {
  @ApiProperty({ enum: StatutoryScheme })
  @IsEnum(StatutoryScheme)
  scheme: StatutoryScheme;
  @ApiProperty() @IsString() @Length(1, 80) category: string;
  @ApiProperty() @IsString() @Length(1, 80) version: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string;
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  sourceUrl: string;
  @ApiProperty() @Matches(/^[a-f0-9]{64}$/) sourceSha256: string;
  @ApiProperty({
    type: 'object',
    description:
      'TABLE (bands), RATE (rates and rounding), or EXEMPT (reason). Draft references must be verified before activation.',
  })
  @IsObject()
  parameters: Record<string, unknown>;
}
export class PreviewDto {
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) wages: string;
}
export class ContributionPreviewDataDto {
  @ApiProperty() employee: string;
  @ApiProperty() employer: string;
  @ApiProperty() basis: string;
  @ApiPropertyOptional({
    description: 'Combined remittance total for TOTAL_WHOLE_UP rules.',
  })
  total?: string;
  @ApiPropertyOptional({
    description:
      'Signed difference between the remittance total and displayed shares; not automatically charged to either party.',
  })
  remittanceRounding?: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) trace: Record<
    string,
    unknown
  >;
  @ApiProperty({ format: 'uuid' }) rulesetId: string;
  @ApiProperty() version: string;
  @ApiProperty({ enum: StatutoryScheme }) scheme: StatutoryScheme;
  @ApiProperty() sourceUrl: string;
  @ApiProperty() sourceSha256: string;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  provenance: Record<string, unknown> | null;
}
export class ContributionPreviewResponseDto {
  @ApiProperty({ type: ContributionPreviewDataDto })
  data: ContributionPreviewDataDto;
}
