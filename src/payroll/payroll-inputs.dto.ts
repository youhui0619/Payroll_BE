import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class PayrollInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() employeeId: string;
  @ApiProperty({
    format: 'uuid',
    description: 'Reuse only for retrying the identical request.',
  })
  @IsUUID()
  idempotencyKey: string;
  @ApiProperty({ example: 'BONUS' })
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  componentCode: string;
  @ApiProperty({
    example: '100.00',
    description:
      'Positive amount; the component definition determines earning or deduction.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  amount: string;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class VoidPayrollInputDto {
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class PayrollInputResponseData extends PayrollInputDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) runId: string;
  @ApiProperty({ format: 'uuid' }) createdBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time', nullable: true }) voidedAt: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) voidedBy: string | null;
  @ApiProperty({ nullable: true }) voidReason: string | null;
}
export class PayrollInputResponse {
  @ApiProperty({ type: PayrollInputResponseData })
  data: PayrollInputResponseData;
}
export class PayrollInputsResponse {
  @ApiProperty({ type: [PayrollInputResponseData] })
  data: PayrollInputResponseData[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  meta: Record<string, number>;
}
