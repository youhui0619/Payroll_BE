import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PageDto } from '../common/page.dto';

export class TaxOpeningDto {
  @ApiProperty({ minimum: 2000, maximum: 2200 })
  @IsInt()
  @Min(2000)
  @Max(2200)
  year: number;
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  effectiveMonth: number;
  @ApiProperty({
    description:
      'Cumulative current-year taxable remuneration from previous employers only; replacement total, not delta.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  taxableIncome: string;
  @ApiProperty({
    description: 'Previous-employer employee EPF before annual cap.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  employeeEpf: string;
  @ApiProperty({
    description:
      'Previous-employer MTD excluding CP38 and voluntary extra withholding.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  mtd: string;
  @ApiProperty() @Matches(/^\d{1,12}(\.\d{1,2})?$/) zakat: string;
  @ApiProperty({ description: 'Reference to reviewed TP3/supporting records.' })
  @IsString()
  @Length(1, 500)
  evidenceReference: string;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class TaxOpeningQueryDto extends PageDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year: number;
}
export class TaxOpeningVersionDto extends TaxOpeningDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class TaxOpeningResponseDto {
  @ApiProperty({ type: TaxOpeningVersionDto }) data: TaxOpeningVersionDto;
}
export class TaxOpeningHistoryDto {
  @ApiProperty({ type: [TaxOpeningVersionDto] }) data: TaxOpeningVersionDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  meta: Record<string, number>;
}
