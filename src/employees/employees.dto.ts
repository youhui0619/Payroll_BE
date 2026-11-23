import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageDto } from '../common/page.dto';
import { EMPLOYMENT_TYPE_VALUES } from '../workforce/employment-types';
import type { EmploymentType } from '../workforce/employment-types';
import { WorkingScheduleDto } from '../workforce/working-schedule.dto';

const emptyStringAsNull = ({ value }: TransformFnParams) =>
  value === '' ? null : value;

export class EmployeeQueryDto extends PageDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  employmentStatus?: string;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPE_VALUES })
  @IsOptional()
  @Transform(({ value }) =>
    value === ''
      ? null
      : typeof value === 'string'
        ? value.trim().toUpperCase()
        : value,
  )
  @IsIn(EMPLOYMENT_TYPE_VALUES)
  employmentType?: EmploymentType | null;
  @ApiPropertyOptional({
    description: 'Filter by active or archived employees.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}

export class CreateEmployeeDto {
  @ApiProperty() @IsString() @Length(1, 30) employeeNo: string;
  @ApiProperty() @IsString() @Length(1, 200) name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsEmail()
  email?: string | null;
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  joinedDate: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  departmentId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  positionId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  managerId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  locationId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  scheduleId?: string | null;

  // Personal Information
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nricPassportNo?: string;
  @ApiPropertyOptional({ example: '1990-01-01', nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string | null;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 20)
  gender?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nationality?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  race?: string | null;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  religion?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 30)
  maritalStatus?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  tin?: string | null;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactNo?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine1?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine2?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postcode?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  state?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  country?: string;

  // Employment Details
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  employmentStatus?: string;
  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPE_VALUES })
  @IsOptional()
  @Transform(({ value }) =>
    value === ''
      ? null
      : typeof value === 'string'
        ? value.trim().toUpperCase()
        : value,
  )
  @IsIn(EMPLOYMENT_TYPE_VALUES)
  employmentType?: EmploymentType | null;
  @ApiPropertyOptional({ type: WorkingScheduleDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingScheduleDto)
  workingSchedule?: WorkingScheduleDto | null;
  @ApiPropertyOptional({ example: '2026-04-01', nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  confirmationDate?: string | null;
  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  resignationDate?: string | null;

  // Banking & Payroll
  @ApiPropertyOptional({ example: 2300, nullable: true })
  @IsOptional()
  @Transform(emptyStringAsNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basicSalary?: number | null;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  salaryType?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  paymentMethod?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  bank?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  bankAccount?: string;

  // Statutory Identifiers & Rates
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  epfEmployeeNo?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  epfEmployerNo?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 20)
  epfRate?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  kwspNo?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  socsoNo?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  contributionCategory?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  eisStatus?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  hrdRegisterNo?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statutoryEntitlementCodes?: string[];

  // Overtime Settings
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeOvertime?: boolean;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  overtimeCalculationBasis?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overtimeHourlyRate?: number;

  // Emergency Contact
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactName?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  emergencyContactRelationship?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  emergencyContactNo?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  emergencyContactAddressLine1?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  emergencyContactAddressLine2?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactCity?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 20)
  emergencyContactPostcode?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactState?: string;
  @ApiPropertyOptional()
  @Transform(emptyStringAsNull)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactCountry?: string;

  // Leave & Commission Assignments
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leavePolicyCodes?: string[];
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  leaveEntitlementOverrides?: Record<string, any>;
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  leaveServiceEntitlementTiers?: Record<string, any>;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  medicalLeaveEntitlement?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  medicalLeavePeriod?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commissionSettingCodes?: string[];
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SalaryDto {
  @ApiProperty({
    example: '3500.00',
    description:
      'Non-negative decimal string; at most 12 integer digits and 2 decimal places.',
  })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/)
  amount: string;
  @ApiProperty({
    example: '2026-11-01',
    description:
      'Inclusive start date; the prior salary ends exclusively on this date.',
  })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom: string;
}
