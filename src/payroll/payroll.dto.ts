import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  Matches,
} from 'class-validator';

export class PayrollSettingsDto {
  @ApiProperty({ minimum: 1, maximum: 31 })
  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay: number;
  @ApiProperty({ minimum: 1, maximum: 31 })
  @IsInt()
  @Min(1)
  @Max(31)
  payDay: number;
  @ApiProperty({ enum: ['MYR'] }) @IsIn(['MYR']) currency: string;
  @ApiProperty({
    description: 'Require an approver other than the payroll creator.',
  })
  @IsBoolean()
  makerChecker: boolean;
}

export class PayrollProfileDto {
  @ApiProperty({
    format: 'date',
    description:
      'First day of the contribution month. Same-month corrections append a revision.',
  })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-01$/)
  effectiveFrom: string;
  @ApiProperty({ enum: ['ENROLLED', 'OPTED_OUT', 'MANDATORY', 'NOT_ELIGIBLE'] })
  @IsIn(['ENROLLED', 'OPTED_OUT', 'MANDATORY', 'NOT_ELIGIBLE'])
  lindungParticipation: string;
  @ApiProperty({
    description:
      'Reason and reference supporting this category/participation change.',
  })
  @IsString()
  @Length(1, 1000)
  reason: string;
  @ApiProperty() @IsString() @Length(1, 80) epfCategory: string;
  @ApiProperty() @IsString() @Length(1, 80) socsoCategory: string;
  @ApiProperty() @IsString() @Length(1, 80) eisCategory: string;
  @ApiProperty() @IsString() @Length(1, 80) lindungCategory: string;
  @ApiProperty() @IsString() @Length(1, 80) pcbCategory: string;
  @ApiProperty() @IsString() @Length(1, 80) hrdCategory: string;
}

export class CreatePayrollDto {
  @ApiProperty({ minimum: 2000, maximum: 2200 })
  @IsInt()
  @Min(2000)
  @Max(2200)
  year: number;
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class PayrollProfileVersionDto extends PayrollProfileDto {
  @ApiProperty({
    format: 'date-time',
    description: 'UTC midnight of the effective salary month.',
  })
  effectiveFrom: string;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class PayrollProfileResponseDto {
  @ApiProperty({ type: PayrollProfileVersionDto, nullable: true })
  data: PayrollProfileVersionDto | null;
}
export class PayrollProfileHistoryDto {
  @ApiProperty({ type: [PayrollProfileVersionDto] })
  data: PayrollProfileVersionDto[];
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
