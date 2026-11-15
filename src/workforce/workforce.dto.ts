import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PageDto } from '../common/page.dto';
export const STATES = [
  'MY-01',
  'MY-02',
  'MY-03',
  'MY-04',
  'MY-05',
  'MY-06',
  'MY-07',
  'MY-08',
  'MY-09',
  'MY-10',
  'MY-11',
  'MY-12',
  'MY-13',
  'MY-14',
  'MY-15',
  'MY-16',
];
export const REGIONS = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Kuala Lumpur',
  'Labuan',
  'Malacca',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Putrajaya',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Wilayah Persekutuan Kuala Lumpur',
];
export const HOLIDAY_REGIONS = [...STATES, ...REGIONS] as const;
export class LocationDto {
  @ApiProperty() @IsString() @Length(1, 30) code: string;
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiProperty({ enum: [...STATES, ...REGIONS] })
  @IsIn([...STATES, ...REGIONS])
  state: string;
  @ApiPropertyOptional({ enum: ['OFFICE', 'BRANCH', 'WAREHOUSE', 'REMOTE'] })
  @IsOptional()
  @IsIn(['OFFICE', 'BRANCH', 'WAREHOUSE', 'REMOTE'])
  type?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  remark?: string;
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
  country?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string;
  @ApiProperty({ default: 'Asia/Kuala_Lumpur' })
  @IsString()
  @Length(1, 80)
  timezone = 'Asia/Kuala_Lumpur';
}
export class UpdateLocationDto extends PartialType(LocationDto) {}

export class LocationQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: ['OFFICE', 'BRANCH', 'WAREHOUSE', 'REMOTE'] })
  @IsOptional()
  @IsIn(['OFFICE', 'BRANCH', 'WAREHOUSE', 'REMOTE'])
  type?: string;

  @ApiPropertyOptional({ enum: [...STATES, ...REGIONS] })
  @IsOptional()
  @IsIn([...STATES, ...REGIONS])
  state?: string;

  @ApiPropertyOptional({
    description: 'Filter by active or archived locations.',
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
export class ScheduleDto {
  @ApiProperty() @IsString() @Length(1, 30) code: string;
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiProperty({
    example: [1, 2, 3, 4, 5],
    description:
      'UTC weekday indexes: Sunday=0, Saturday=6; applied to local calendar dates.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workingDays: number[];
  @ApiProperty({ example: 540 })
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute: number;
  @ApiProperty({ example: 1080 }) @IsInt() @Min(0) @Max(1439) endMinute: number;
  @ApiProperty({ default: 60 }) @IsInt() @Min(0) @Max(720) breakMinutes = 60;
  @ApiProperty({ default: 0 }) @IsInt() @Min(0) @Max(120) graceMinutes = 0;
  @ApiPropertyOptional({
    enum: [
      'Permanent',
      'Contract',
      'Part-time',
      'Intern',
      'Temporary',
      'Trainee',
      'Freelance',
      'Casual',
    ],
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  employmentType?: string;
  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  scheduleDays?: Record<string, unknown>;
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
export class UpdateScheduleDto extends PartialType(ScheduleDto) {}

export class ScheduleQueryDto extends PageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  employmentType?: string;

  @ApiPropertyOptional({
    description: 'Filter by active or archived schedules.',
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
export class HolidayDto {
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;
  @ApiPropertyOptional({ enum: ['National', 'State'] })
  @IsOptional()
  @IsIn(['National', 'State'])
  scope?: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate: string;
  @ApiPropertyOptional({
    example: [],
    description: 'Empty for national; otherwise Malaysian state codes.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(STATES, { each: true })
  states?: string[];

  @ApiPropertyOptional({
    example: ['Johor', 'Selangor'],
    description: 'Archive-compatible region names or Malaysian state codes.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(HOLIDAY_REGIONS, { each: true })
  regions?: string[];

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
export class UpdateHolidayDto extends PartialType(HolidayDto) {}

export class HolidayQueryDto extends PageDto {
  @ApiPropertyOptional({ minimum: 2000, maximum: 2200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  @ApiPropertyOptional({ enum: ['National', 'State'] })
  @IsOptional()
  @IsIn(['National', 'State'])
  scope?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({ enum: HOLIDAY_REGIONS })
  @IsOptional()
  @IsIn(HOLIDAY_REGIONS)
  region?: string;
}
export class AssignmentDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() managerId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() locationId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() scheduleId?:
    string | null;
}
export class DateRangeDto {
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;
}
