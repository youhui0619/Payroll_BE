import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';

const emptyStringAsNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

export type PayrollDay = number | 'LAST_DAY';
export const PAYROLL_DAYS = [
  ...Array.from({ length: 31 }, (_, index) => index + 1),
  'LAST_DAY',
];

export class PayrollSettingsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payDay?: number;

  @ApiPropertyOptional({
    oneOf: [
      { type: 'integer', minimum: 1, maximum: 31 },
      { type: 'string', enum: ['LAST_DAY'] },
    ],
  })
  @IsOptional()
  @IsIn(PAYROLL_DAYS)
  payrollCutoffDay?: PayrollDay;

  @ApiProperty({ enum: ['MYR'] }) @IsIn(['MYR']) currency: string;
  @ApiPropertyOptional({
    description:
      'Require an approver other than the payroll creator. Defaults to true on creation; omission preserves an existing setting.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  makerChecker?: boolean;

  @ApiPropertyOptional({
    enum: ['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY'],
  })
  @IsOptional()
  @IsIn(['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY'])
  payrollFrequency?: string;
  @ApiPropertyOptional({
    oneOf: [
      { type: 'integer', minimum: 1, maximum: 31 },
      { type: 'string', enum: ['LAST_DAY'] },
    ],
  })
  @IsOptional()
  @IsIn(PAYROLL_DAYS)
  scheduledPayDate?: PayrollDay;
  @ApiPropertyOptional({
    enum: ['CALENDAR_DAYS', 'FIXED_26_DAYS', 'WORKING_DAYS'],
  })
  @IsOptional()
  @IsIn(['CALENDAR_DAYS', 'FIXED_26_DAYS', 'WORKING_DAYS'])
  salaryProrationMethod?: string;
  @ApiPropertyOptional({ enum: [2, 3] })
  @IsOptional()
  @IsIn([2, 3])
  calculationPrecision?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeBasicSalary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeOvertime?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeClaimsAndAllowance?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeBonus?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeCommissionAndIncentives?: boolean;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(24)
  standardWorkingHoursPerDay?: number | null;
  @ApiPropertyOptional({
    enum: ['NONE', '15_MINUTES', '30_MINUTES', '60_MINUTES'],
    description: 'Minimum overtime duration that can be submitted or paid.',
  })
  @IsOptional()
  @IsIn(['NONE', '15_MINUTES', '30_MINUTES', '60_MINUTES'])
  minimumOvertimeDuration?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  normalWorkingDayMultiplier?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Z][A-Z0-9_]{0,29}$/)
  normalWorkingDayEarningCode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  configureRestDayRates?: boolean;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  restDayOvertimeMultiplier?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Z][A-Z0-9_]{0,29}$/)
  restDayEarningCode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  configurePublicHolidayRates?: boolean;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  publicHolidayOvertimeMultiplier?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Z][A-Z0-9_]{0,29}$/)
  publicHolidayEarningCode?: string;
  @ApiPropertyOptional({
    enum: [
      'CALENDAR_DAYS',
      'FIXED_26_DAYS',
      'WORKING_DAYS',
      'FOLLOW_SALARY_PRORATION',
    ],
  })
  @IsOptional()
  @IsIn([
    'CALENDAR_DAYS',
    'FIXED_26_DAYS',
    'WORKING_DAYS',
    'FOLLOW_SALARY_PRORATION',
  ])
  deductionProrationMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeEpf?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeSocso?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeEis?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includePcb?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeHrdCorpLevy?: boolean;
  @ApiPropertyOptional({ enum: ['BANK_TRANSFER', 'CASH', 'OTHER'] })
  @IsOptional()
  @IsIn(['BANK_TRANSFER', 'CASH', 'OTHER'])
  paymentMethod?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  automaticallyCalculatePayroll?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  blockApprovalOnValidationErrors?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  lockAfterFinalApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyApprovers?: boolean;
  @ApiPropertyOptional({ enum: ['ONE_APPROVER', 'TWO_STEP'] })
  @IsOptional()
  @IsIn(['ONE_APPROVER', 'TWO_STEP'])
  approvalWorkflow?: string;
}

class PayrollSettingsDataDto extends PayrollSettingsDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
}
export class PayrollSettingsResponseDto {
  @ApiProperty({ type: PayrollSettingsDataDto, nullable: true })
  data: PayrollSettingsDataDto | null;
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
