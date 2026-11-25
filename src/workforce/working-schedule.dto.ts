import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export const WORKING_DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIME_OR_EMPTY_PATTERN = /^$|^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class WorkingDayDto {
  @ApiProperty({ enum: WORKING_DAY_NAMES })
  @IsIn(WORKING_DAY_NAMES)
  day: string;

  @ApiProperty()
  @IsBoolean()
  isWorkingDay: boolean;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(TIME_PATTERN)
  startTime: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(TIME_PATTERN)
  endTime: string;

  @ApiProperty({ example: '13:00' })
  @IsString()
  @Matches(TIME_OR_EMPTY_PATTERN)
  breakStartTime: string;

  @ApiProperty({ example: '14:00' })
  @IsString()
  @Matches(TIME_OR_EMPTY_PATTERN)
  breakEndTime: string;
}

export class WorkingScheduleDto {
  @ApiProperty({ type: [WorkingDayDto], minItems: 7, maxItems: 7 })
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WorkingDayDto)
  days: WorkingDayDto[];
}

export class WorkingScheduleMapResponseDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'object' },
    description:
      'Working schedules keyed by employment type, for example data["PART-TIME"].',
  })
  data: Record<string, WorkingScheduleDto | null>;
}
