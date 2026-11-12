import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ClockDto {
  @ApiProperty({
    description: 'Reuse the same UUID when retrying a clock command.',
  })
  @IsUUID()
  idempotencyKey: string;
}
export class ClockOutDto extends ClockDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  remark?: string;
}
