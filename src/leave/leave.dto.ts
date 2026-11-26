import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { LeaveApproval } from '@prisma/client';
import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { PageDto } from '../common/page.dto';
import { emptyStringAsUndefined } from '../common/transformers';

const emptyStringAsNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

export class LeaveBalanceQueryDto {
  @ApiPropertyOptional({
    minimum: 2000,
    maximum: 2200,
    description: 'Defaults to the current year in the company timezone.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;
}

export class LeaveBalanceItemDto {
  @ApiProperty() policyId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() year: number;
  @ApiProperty() paid: boolean;
  @ApiProperty() active: boolean;
  @ApiProperty({
    example: '14.00',
    description: 'Posted ledger total, after approved usage and reversals.',
  })
  balance: string;
  @ApiProperty({
    example: '2.00',
    description: 'Paid leave awaiting manager or HR approval.',
  })
  reserved: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: '12.00',
    description: 'Posted balance minus reservations. Null for unpaid leave.',
  })
  available: string | null;
}
export class LeaveBalanceMetaDto {
  @ApiProperty() year: number;
  @ApiProperty() employeeId: string;
}
export class LeaveBalanceResponseDto {
  @ApiProperty({ type: [LeaveBalanceItemDto] }) data: LeaveBalanceItemDto[];
  @ApiProperty({ type: LeaveBalanceMetaDto }) meta: LeaveBalanceMetaDto;
}

export class LeaveApplicationQueryDto extends PageDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  employeeId?: string;
}

export class LeaveServiceEntitlementTierDto {
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  serviceFrom?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  serviceTo?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  daysPerYear?: number | null;
}

export class LeavePolicyDto {
  @ApiProperty() @IsString() @Length(1, 30) code: string;
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsString()
  @Length(1, 1000)
  description?: string | null;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ default: true }) @IsBoolean() paid = true;
  @ApiPropertyOptional({ enum: ['DAILY', 'HOURLY'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['DAILY', 'HOURLY'])
  entitlementUnit?: string;
  @ApiPropertyOptional({ enum: ['FIXED', 'SERVICE'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['FIXED', 'SERVICE'])
  entitlementCalculationMethod?: string;
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultEntitlement?: number | null;
  @ApiPropertyOptional({ type: [LeaveServiceEntitlementTierDto] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveServiceEntitlementTierDto)
  serviceEntitlementTiers?: LeaveServiceEntitlementTierDto[];
  @ApiPropertyOptional({
    enum: ['ANNUAL', 'MONTHLY_ACCRUAL', 'SERVICE_ANNIVERSARY', 'MANUAL'],
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['ANNUAL', 'MONTHLY_ACCRUAL', 'SERVICE_ANNIVERSARY', 'MANUAL'])
  entitlementGrantMethod?: string;
  @ApiPropertyOptional({
    enum: [
      'ALL_EMPLOYEES',
      'PERMANENT',
      'PROBATION',
      'PART_TIME',
      'CONTRACT_WORKER',
      'INTERN',
    ],
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn([
    'ALL_EMPLOYEES',
    'PERMANENT',
    'PROBATION',
    'PART_TIME',
    'CONTRACT_WORKER',
    'INTERN',
  ])
  eligibility?: string;
  @ApiPropertyOptional({
    enum: ['CALENDAR', 'EMPLOYMENT_ANNIVERSARY', 'FINANCIAL'],
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['CALENDAR', 'EMPLOYMENT_ANNIVERSARY', 'FINANCIAL'])
  leaveYear?: string;
  @ApiPropertyOptional({ enum: ['NONE', 'LIMITED', 'UNLIMITED', 'HR_REVIEW'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['NONE', 'LIMITED', 'UNLIMITED', 'HR_REVIEW'])
  carryForwardPolicy?: string;
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maximumCarryForward?: number | null;
  @ApiPropertyOptional({
    enum: ['PAID', 'UNPAID'],
    description: 'FE-compatible alias for the paid flag.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['PAID', 'UNPAID'])
  leaveType?: 'PAID' | 'UNPAID';
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  requireSupportingDocuments?: boolean;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  allowEmployeeSpecificSettings?: boolean;
  @ApiProperty({ default: false }) @IsBoolean() allowHalfDay = false;
  @ApiProperty({ default: 0 }) @IsInt() @Min(0) @Max(365) noticeDays = 0;
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 365,
    description: 'FE-compatible alias for noticeDays.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsInt()
  @Min(0)
  @Max(365)
  minimumAdvanceNotice?: number;
  @ApiProperty({ enum: LeaveApproval })
  @IsEnum(LeaveApproval)
  approval: LeaveApproval;
  @ApiPropertyOptional({
    enum: LeaveApproval,
    description: 'FE-compatible alias for approval.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsEnum(LeaveApproval)
  approvalOverflow?: LeaveApproval;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string | null;
}
export class UpdateLeavePolicyDto extends PartialType(LeavePolicyDto) {
  @ApiPropertyOptional({ description: 'Archive the policy from new requests.' })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  active?: boolean;
}

export class LeavePolicyQueryDto extends PageDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Filter by active or archived policies.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  paid?: boolean;

  @ApiPropertyOptional({ enum: LeaveApproval })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsEnum(LeaveApproval)
  approval?: LeaveApproval;
}
export class LeaveDto {
  @ApiPropertyOptional({
    description:
      'Target employee UUID; OWNER/HR may also provide the employee number when creating on behalf of an employee.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 100)
  employeeId?: string;
  @ApiPropertyOptional({
    format: 'date',
    description:
      'Request date. Defaults to the current date in the company timezone.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  requestDate?: string;
  @ApiProperty() @IsUUID() policyId: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate: string;
  @ApiProperty({ default: false }) @IsBoolean() halfDay = false;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsString()
  @Length(1, 100)
  reference?: string | null;
}
export class GrantDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty() @IsUUID() policyId: string;
  @ApiProperty() @IsInt() @Min(2000) @Max(2200) year: number;
  @ApiProperty({ example: '14.00' })
  @IsString()
  @Matches(/^-?(0|[1-9]\d{0,2})(\.\d{1,2})?$/)
  days: string;
  @ApiProperty() @IsString() @Length(1, 500) reason: string;
  @ApiProperty() @IsUUID() idempotencyKey: string;
}

export class LeaveAccrualDto {
  @ApiProperty({ minimum: 2000, maximum: 2200, example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year: number;
}
