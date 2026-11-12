import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { StatutoryScheme } from '@prisma/client';
import { PageDto } from '../common/page.dto';

export class ComponentDefinitionDto {
  @ApiProperty({ example: 'BASIC' })
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  code: string;
  @ApiProperty() @IsString() @Length(1, 100) name: string;
  @ApiProperty({ enum: ['EARNING', 'DEDUCTION'] })
  @IsIn(['EARNING', 'DEDUCTION'])
  kind: 'EARNING' | 'DEDUCTION';
  @ApiProperty({
    format: 'date',
    description: 'First day of the effective salary month.',
  })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-01$/)
  effectiveFrom: string;
  @ApiProperty() @IsBoolean() active: boolean;
  @ApiProperty() @IsBoolean() affectsGross: boolean;
  @ApiProperty() @IsBoolean() affectsNet: boolean;
  @ApiProperty({
    enum: StatutoryScheme,
    isArray: true,
    description:
      'Earnings add and deductions subtract from these wage bases. Eligibility/exemptions must be reviewed separately.',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsEnum(StatutoryScheme, { each: true })
  statutoryBases: StatutoryScheme[];
  @ApiProperty({
    enum: [
      'NORMAL',
      'ADDITIONAL',
      'EXCLUDED',
      'EXCLUDED_NORMAL',
      'EXCLUDED_ADDITIONAL',
      'UNCLASSIFIED',
    ],
    default: 'UNCLASSIFIED',
    required: false,
    description:
      'PCB-bearing components require NORMAL or ADDITIONAL. Tax-exempt EPF-bearing payments use EXCLUDED_NORMAL or EXCLUDED_ADDITIONAL; other excluded payments may use EXCLUDED or UNCLASSIFIED; exclusion eligibility must be reviewed separately.',
  })
  @IsIn([
    'NORMAL',
    'ADDITIONAL',
    'EXCLUDED',
    'EXCLUDED_NORMAL',
    'EXCLUDED_ADDITIONAL',
    'UNCLASSIFIED',
  ])
  pcbTreatment?: string = 'UNCLASSIFIED';
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class ComponentListDto extends PageDto {
  @ApiProperty({
    format: 'date',
    description:
      'Salary month to resolve, using its first day. Search filters code only.',
  })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-01$/)
  asOf: string;
}
export class ComponentVersionDto extends ComponentDefinitionDto {
  @ApiProperty({
    format: 'date-time',
    description: 'UTC midnight of the effective salary month.',
  })
  effectiveFrom: string;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class ComponentResponseDto {
  @ApiProperty({ type: ComponentVersionDto }) data: ComponentVersionDto;
}
export class ComponentListResponseDto {
  @ApiProperty({ type: [ComponentVersionDto] }) data: ComponentVersionDto[];
  @ApiProperty({
    type: 'object',
    properties: {
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      total: { type: 'integer' },
      totalPages: { type: 'integer' },
    },
  })
  meta: Record<string, number>;
}
