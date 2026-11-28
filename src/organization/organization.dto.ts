import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageDto } from '../common/page.dto';
import { emptyStringAsUndefined } from '../common/transformers';

const emptyStringToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

export const FINANCIAL_MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const;

export class DepartmentDto {
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 30)
  code: string;

  @ApiProperty() @IsString() @Length(1, 120) name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  parentDepartmentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  headOfDepartmentId?: string | null;

  @ApiPropertyOptional({ example: '2026-01-01', nullable: true })
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  active?: boolean;
}

export class UpdateDepartmentDto extends PartialType(DepartmentDto) {}

export class PositionDto {
  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 30)
  code: string;

  @ApiProperty() @IsString() @Length(1, 120) title: string;

  @ApiPropertyOptional({
    enum: ['ENTRY', 'INTERMEDIATE', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR'],
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  jobLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  @Length(1, 120)
  reportsTo?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01', nullable: true })
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string | null;
}

export class UpdatePositionDto extends PartialType(PositionDto) {}

export class DepartmentQueryDto extends PageDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Filter by active state.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  parentDepartmentId?: string;
}

export class PositionQueryDto extends PageDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    enum: ['ENTRY', 'INTERMEDIATE', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR'],
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['ENTRY', 'INTERMEDIATE', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR'])
  jobLevel?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Filter by active state.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}

export class CompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 80)
  registrationNo?: string;

  @ApiPropertyOptional({
    description: 'Limited liability partnership registration number.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 80)
  llpNo?: string;

  @ApiPropertyOptional({
    description: 'FE-compatible alias for llpNo.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 80)
  llpNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @MaxLength(40)
  contactNo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsInt()
  @Min(1)
  @Max(12)
  financialYearStartMonth?: number;

  @ApiPropertyOptional({ enum: FINANCIAL_MONTHS })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(FINANCIAL_MONTHS)
  financialStartingMonth?: (typeof FINANCIAL_MONTHS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 50)
  sstNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 50)
  taxNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 200)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 500)
  logo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 200)
  businessAddressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 200)
  businessAddressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 100)
  businessCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 20)
  businessPostcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 100)
  businessState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 100)
  businessCountry?: string;
}
