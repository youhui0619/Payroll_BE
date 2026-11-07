import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, Matches } from 'class-validator';
import { TP1_CODES, Tp1Code, Tp1ReliefInput } from './tp1-reliefs';
export class Tp1PreviewDto implements Tp1ReliefInput {
  @ApiProperty({ enum: [2026] }) @IsIn([2026]) year: number;
  @ApiProperty({
    type: 'object',
    description:
      'Reviewed cumulative current-year expense amounts, including previous employment. Omitted codes are zero. Values are decimal strings. C1AB/C3AB/C4AB combine their unrestricted a/b items; sublimited items have separate keys.',
    properties: Object.fromEntries(
      TP1_CODES.map((code) => [code, { type: 'string', example: '0.00' }]),
    ),
    additionalProperties: false,
  })
  @IsObject()
  amounts: Partial<Record<Tp1Code, string>>;
  @ApiProperty({
    description:
      'Spouse deduction already claimed in family reliefs, up to 4000.',
  })
  @Matches(/^\d{1,4}(\.\d{1,2})?$/)
  spouseRelief: string;
  @ApiProperty({
    description:
      'Projected qualifying mandatory EPF already deducted by the PCB calculation, up to 4000; not raw EPF paid.',
  })
  @Matches(/^\d{1,4}(\.\d{1,2})?$/)
  projectedMandatoryEpf: string;
}
class Tp1GroupDto {
  @ApiProperty() code: string;
  @ApiProperty() claimed: string;
  @ApiProperty() allowed: string;
  @ApiProperty() limit: string;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        claimed: { type: 'string' },
        afterSublimit: { type: 'string' },
      },
    },
  })
  subitems: Record<string, string>[];
}
class Tp1ResultDto {
  @ApiProperty() year: number;
  @ApiProperty() total: string;
  @ApiProperty({ type: [Tp1GroupDto] }) groups: Tp1GroupDto[];
  @ApiProperty({
    type: 'object',
    properties: {
      spouseRelief: { type: 'string' },
      projectedMandatoryEpf: { type: 'string' },
    },
  })
  context: Record<string, string>;
  @ApiProperty() sourceUrl: string;
  @ApiProperty({ type: [String] }) limitations: string[];
}
export class Tp1PreviewResponseDto {
  @ApiProperty({ type: Tp1ResultDto }) data: Tp1ResultDto;
}
