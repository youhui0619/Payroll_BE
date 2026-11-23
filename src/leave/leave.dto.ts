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

const emptyStringAsNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

export class LeaveBalanceQueryDto {
  @ApiPropertyOptional({
    minimum: 2000,
    maximum: 2200,
    description: 'Defaults to the current year in the company timezone.',
  })
  @IsOptional()
  @Type(() => Number)
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
  @IsString()
  @Length(1, 1000)
  description?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ default: true }) @IsBoolean() paid = true;
  @ApiPropertyOptional({ enum: ['DAILY', 'HOURLY'] })
  @IsOptional()
  @IsIn(['DAILY', 'HOURLY'])
  entitlementUnit?: string;
  @ApiPropertyOptional({ enum: ['FIXED', 'SERVICE'] })
  @IsOptional()
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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveServiceEntitlementTierDto)
  serviceEntitlementTiers?: LeaveServiceEntitlementTierDto[];
  @ApiPropertyOptional({
    enum: ['ANNUAL', 'MONTHLY_ACCRUAL', 'SERVICE_ANNIVERSARY', 'MANUAL'],
  })
  @IsOptional()
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
  @IsIn(['CALENDAR', 'EMPLOYMENT_ANNIVERSARY', 'FINANCIAL'])
  leaveYear?: string;
  @ApiPropertyOptional({ enum: ['NONE', 'LIMITED', 'UNLIMITED', 'HR_REVIEW'] })
  @IsOptional()
  @IsIn(['NONE', 'LIMITED', 'UNLIMITED', 'HR_REVIEW'])
  carryForwardPolicy?: string;
  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maximumCarryForward?: number | null;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requireSupportingDocuments?: boolean;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowEmployeeSpecificSettings?: boolean;
  @ApiProperty({ default: false }) @IsBoolean() allowHalfDay = false;
  @ApiProperty({ default: 0 }) @IsInt() @Min(0) @Max(365) noticeDays = 0;
  @ApiProperty({ enum: LeaveApproval })
  @IsEnum(LeaveApproval)
  approval: LeaveApproval;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string;
}
export class UpdateLeavePolicyDto extends PartialType(LeavePolicyDto) {
  @ApiPropertyOptional({ description: 'Archive the policy from new requests.' })
  @IsOptional()
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
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  paid?: boolean;

  @ApiPropertyOptional({ enum: LeaveApproval })
  @IsOptional()
  @IsEnum(LeaveApproval)
  approval?: LeaveApproval;
}
export class LeaveDto {
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
