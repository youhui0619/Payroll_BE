import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { EMPLOYMENT_TYPE_VALUES } from '../workforce/employment-types';
import type { EmploymentType } from '../workforce/employment-types';

export class EmployeeImportRowDto {
  @ApiProperty({ example: 'EMP-0042' })
  @IsString()
  @Length(1, 30)
  employeeNo: string;

  @ApiProperty({ example: 'Aida Tan' })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString({ strict: true })
  joinedDate: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  positionId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  scheduleId?: string | null;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPE_VALUES, nullable: true })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPE_VALUES)
  employmentType?: EmploymentType | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true, example: 5500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basicSalary?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  salaryType?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  paymentMethod?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  bank?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  bankAccount?: string | null;
}

export class EmployeeImportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty({ type: [EmployeeImportRowDto], maxItems: 1000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => EmployeeImportRowDto)
  rows: EmployeeImportRowDto[];
}
