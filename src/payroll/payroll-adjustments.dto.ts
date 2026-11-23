import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class PayrollAdjustmentDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Finalized run containing the original payroll line.',
  })
  @IsUUID()
  sourceRunId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Stable key for safe retries of this correction.',
  })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty({ example: 'BONUS' })
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  componentCode: string;

  @ApiProperty({
    example: '250.00',
    description:
      'Positive amount; the component definition determines earning or deduction.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  amount: string;

  @ApiProperty({ example: 'Underpaid allowance in the March payroll.' })
  @IsString()
  @Length(1, 1000)
  reason: string;
}

export class PayrollAdjustmentVoidDto {
  @ApiProperty({ example: 'Correction entered in error.' })
  @IsString()
  @Length(1, 1000)
  reason: string;
}

export class PayrollAdjustmentResponseData {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) sourceRunId: string;
  @ApiProperty({ format: 'uuid' }) targetRunId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty({ format: 'uuid' }) inputId: string;
  @ApiProperty({ format: 'uuid' }) idempotencyKey: string;
  @ApiProperty() componentCode: string;
  @ApiProperty() amount: string;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'uuid' }) createdBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time', nullable: true }) voidedAt: string | null;
  @ApiProperty({ nullable: true }) voidReason: string | null;
}

export class PayrollAdjustmentResponse {
  @ApiProperty({ type: PayrollAdjustmentResponseData })
  data: PayrollAdjustmentResponseData;
}

export class PayrollAdjustmentsResponse {
  @ApiProperty({ type: [PayrollAdjustmentResponseData] })
  data: PayrollAdjustmentResponseData[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  meta: Record<string, number>;
}
