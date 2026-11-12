import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { Tp1PreviewDto } from './tp1.dto';

export class TaxExpensesDto extends PickType(Tp1PreviewDto, [
  'year',
  'amounts',
] as const) {
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  effectiveMonth: number;
  @ApiProperty({
    description:
      'Reviewed TP1/receipt reference, including eligibility and recurring-claim checks.',
  })
  @IsString()
  @Length(1, 500)
  evidenceReference: string;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class TaxExpensesVersionDto extends TaxExpensesDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class TaxExpensesResponseDto {
  @ApiProperty({ type: TaxExpensesVersionDto }) data: TaxExpensesVersionDto;
}
export class TaxExpensesHistoryDto {
  @ApiProperty({ type: [TaxExpensesVersionDto] }) data: TaxExpensesVersionDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  meta: Record<string, number>;
}
