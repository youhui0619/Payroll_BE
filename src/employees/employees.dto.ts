import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
} from 'class-validator';
import { PageDto } from '../common/page.dto';
import { EMPLOYMENT_TYPE_VALUES } from '../workforce/employment-types';
import type { EmploymentType } from '../workforce/employment-types';

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
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(EMPLOYMENT_TYPE_VALUES)
  employmentType?: EmploymentType;

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
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  joinedDate: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() positionId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() managerId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() locationId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() scheduleId?:
    string | null;

  // Personal Information
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nricPassportNo?: string;
  @ApiPropertyOptional({ example: '1990-01-01', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  gender?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) race?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  religion?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 30)
  maritalStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) tin?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine1?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine2?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postcode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  state?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  country?: string;

  // Employment Details
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  employmentStatus?: string;
  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPE_VALUES })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(EMPLOYMENT_TYPE_VALUES)
  employmentType?: EmploymentType;
  @ApiPropertyOptional({ example: '2026-04-01', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  confirmationDate?: string | null;
  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  resignationDate?: string | null;

  // Banking & Payroll
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  salaryType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  paymentMethod?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  bank?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  bankAccount?: string;

  // Statutory Identifiers & Rates
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  epfEmployeeNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  epfEmployerNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  epfRate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  kwspNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  socsoNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  contributionCategory?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  eisStatus?: string;
  @ApiPropertyOptional()
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
  @IsOptional()
  @IsString()
  @Length(1, 50)
  overtimeCalculationBasis?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overtimeHourlyRate?: number;

  // Emergency Contact
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  emergencyContactRelationship?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  emergencyContactNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  emergencyContactAddressLine1?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  emergencyContactAddressLine2?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactCity?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  emergencyContactPostcode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactState?: string;
  @ApiPropertyOptional()
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
