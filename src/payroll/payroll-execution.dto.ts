import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { emptyStringAsUndefined } from '../common/transformers';
import { CalculationPreviewDto } from './calculation-preview.dto';

export class CalculatePayrollDto extends CalculationPreviewDto {
  @ApiPropertyOptional({
    description:
      'Optional note retained in the run audit event. Employee-specific tax review is supplied by the saved declarations; currentZakat is the reviewed run-wide default.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 1000)
  note?: string;
}

export class PayrollPaymentDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  paymentReference: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsDateString({ strict: true })
  paymentDate?: string;
}

class PayrollExecutionDataDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty() year: number;
  @ApiProperty() month: number;
  @ApiProperty({
    enum: ['DRAFT', 'CALCULATED', 'APPROVED', 'PUBLISHED', 'PAID'],
  })
  status: string;
  @ApiProperty() employeeCount: number;
}

export class PayrollExecutionResponseDto {
  @ApiProperty({ type: PayrollExecutionDataDto })
  data: PayrollExecutionDataDto;
}

export class PayrollLifecycleResponseDto {
  @ApiProperty({ type: PayrollExecutionDataDto })
  data: PayrollExecutionDataDto;
}
