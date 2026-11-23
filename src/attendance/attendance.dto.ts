import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  IsInt,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageDto } from '../common/page.dto';

export class ClockDto {
  @ApiProperty({
    description: 'Reuse the same UUID when retrying a clock command.',
  })
  @IsUUID()
  idempotencyKey: string;
}
export class ClockOutDto extends ClockDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  remark?: string;
}

export class AttendanceAdjustmentDto {
  @ApiProperty({ description: 'Reuse the same UUID when retrying a request.' })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty({ example: '2026-11-24' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  attendanceSessionId?: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  requestedClockIn?: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  requestedClockOut?: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  reason: string;
}

export class AttendanceCorrectionDto extends AttendanceAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId: string;
}

export class AttendanceAdjustmentQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class AttendanceCalendarQueryDto {
  @ApiProperty({ example: 2026, minimum: 2000, maximum: 2200 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year: number;

  @ApiProperty({ example: 11, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter the company calendar to one department.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
