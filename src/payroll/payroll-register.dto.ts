import { ApiProperty } from '@nestjs/swagger';
import { PayrollRosterQueryDto } from './payroll-roster.dto';

export class PayrollRegisterQueryDto extends PayrollRosterQueryDto {}

export class PayrollRegisterResponseDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  data: Record<string, unknown>[];

  @ApiProperty({ type: 'object', additionalProperties: true })
  meta: Record<string, unknown>;
}
