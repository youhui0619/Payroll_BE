import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { PageDto } from '../common/page.dto';

export const COMMISSION_TYPES = [
  'SALES_COMMISSION',
  'TIERED_SALES_COMMISSION',
  'REVENUE_COMMISSION',
  'PROFIT_COMMISSION',
  'TARGET_ACHIEVEMENT',
  'REFERRAL_INCENTIVE',
  'COLLECTION_INCENTIVE',
  'PROJECT_INCENTIVE',
  'TEAM_INCENTIVE',
  'PRODUCT_INCENTIVE',
  'CUSTOMER_ACQUISITION',
  'CUSTOM',
] as const;

export const COMMISSION_METHODS = [
  'PERCENTAGE_OF_SALES',
  'PERCENTAGE_OF_REVENUE',
  'PERCENTAGE_OF_PROFIT',
  'FIXED_PER_TRANSACTION',
  'TIERED_RATE',
  'TARGET_BASED',
  'FIXED_AMOUNT',
] as const;

export const COMMISSION_FREQUENCIES = [
  'PER_TRANSACTION',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
] as const;

export const PAYOUT_TIMINGS = [
  'CURRENT_PAYROLL',
  'NEXT_PAYROLL',
  'SEPARATE_PAYOUT',
] as const;

export const ELIGIBILITY_OPTIONS = [
  'ALL_EMPLOYEES',
  'SELECTED_DEPARTMENTS',
  'SELECTED_POSITIONS',
  'SELECTED_EMPLOYEES',
] as const;

export const RECORD_STATUSES = [
  'PENDING_APPROVAL',
  'READY_FOR_PAYROLL',
  'REJECTED',
  'PAID',
] as const;

const decimal = /^(0|[1-9]\d{0,11})(\.\d{1,4})?$/;

const asString = ({ value }: { value: unknown }) =>
  value === null || value === undefined ? value : String(value);

export class CommissionSettingDto {
  @ApiProperty({ maxLength: 20 })
  @IsString()
  @Length(1, 20)
  @Matches(/^[A-Za-z][A-Za-z0-9_-]*$/)
  code: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @Length(1, 60)
  name: string;

  @ApiProperty({ enum: COMMISSION_TYPES })
  @IsIn(COMMISSION_TYPES)
  commissionType: (typeof COMMISSION_TYPES)[number];

  @ApiProperty({ enum: COMMISSION_METHODS })
  @IsIn(COMMISSION_METHODS)
  calculationMethod: (typeof COMMISSION_METHODS)[number];

  @ApiPropertyOptional({ nullable: true, example: '5' })
  @IsOptional()
  @Transform(asString)
  @IsString()
  @Matches(decimal)
  rate?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '250.00' })
  @IsOptional()
  @Transform(asString)
  @IsString()
  @Matches(decimal)
  amount?: string | null;

  @ApiPropertyOptional({ enum: COMMISSION_FREQUENCIES })
  @IsOptional()
  @IsIn(COMMISSION_FREQUENCIES)
  calculationFrequency?: (typeof COMMISSION_FREQUENCIES)[number];

  @ApiPropertyOptional({ enum: PAYOUT_TIMINGS })
  @IsOptional()
  @IsIn(PAYOUT_TIMINGS)
  payoutTiming?: (typeof PAYOUT_TIMINGS)[number];

  @ApiPropertyOptional({ nullable: true, maxLength: 250 })
  @IsOptional()
  @IsString()
  @Length(1, 250)
  description?: string | null;

  @ApiPropertyOptional({ enum: ELIGIBILITY_OPTIONS })
  @IsOptional()
  @IsIn(ELIGIBILITY_OPTIONS)
  eligibleEmployees?: (typeof ELIGIBILITY_OPTIONS)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  eligibleDepartmentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  eligiblePositionIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  eligibleEmployeeIds?: string[];

  @ApiProperty({ maxLength: 20 })
  @IsString()
  @Length(1, 20)
  @Matches(/^[A-Za-z][A-Za-z0-9_-]*$/)
  payrollEarningCode: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class UpdateCommissionSettingDto extends PartialType(
  CommissionSettingDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CommissionSettingQueryDto extends PageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}

export class CommissionRecordDto {
  @ApiProperty() @IsUUID() employeeId: string;

  @ApiPropertyOptional({
    description: 'Use settingId or planCode to select a plan.',
  })
  @IsOptional()
  @IsUUID()
  settingId?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  planCode?: string;

  @ApiPropertyOptional({ nullable: true, example: '24000.00' })
  @IsOptional()
  @Transform(asString)
  @IsString()
  @Matches(decimal)
  calculationBasis?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  referenceId?: string | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  createdDate?: string;
}

export class CommissionRecordQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: RECORD_STATUSES })
  @IsOptional()
  @IsIn(RECORD_STATUSES)
  status?: (typeof RECORD_STATUSES)[number];

  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() planCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
