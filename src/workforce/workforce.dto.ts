import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
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
export class LocationDto {
  @ApiProperty() @IsString() @Length(1, 30) code: string;
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiProperty({ enum: STATES }) @IsIn(STATES) state: string;
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
export class HolidayDto {
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate: string;
  @ApiProperty({
    example: [],
    description: 'Empty for national; otherwise Malaysian state codes.',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(STATES, { each: true })
  states: string[];
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
