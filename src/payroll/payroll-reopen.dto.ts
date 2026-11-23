import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class PayrollReopenDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 1000,
    description: 'Required audit reason for reopening the payroll run.',
  })
  @IsString()
  @Length(1, 1000)
  reason: string;
}
