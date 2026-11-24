import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
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
import { RequestStatus } from '@prisma/client';
import { PageDto } from '../common/page.dto';
import { emptyStringAsUndefined } from '../common/transformers';

export const OVERTIME_TYPES = [
  'NORMAL_WORKING_DAY',
  'REST_DAY',
  'PUBLIC_HOLIDAY',
] as const;

export class OvertimeDto {
  @ApiPropertyOptional({
    description: 'Required when an admin creates for another employee.',
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  departmentId?: string;

  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  requestDate: string;

  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  overtimeDate: string;

  @ApiProperty({ enum: OVERTIME_TYPES })
  @IsIn(OVERTIME_TYPES)
  overtimeType: (typeof OVERTIME_TYPES)[number];

  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @ApiProperty({ example: '21:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;

  @ApiProperty({ minimum: 0, maximum: 1440 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  breakDurationMinutes: number;

  @ApiProperty() @IsString() @Length(1, 2000) description: string;
}

export class UpdateOvertimeDto extends PartialType(OvertimeDto) {}

export class OvertimeQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional({ enum: OVERTIME_TYPES })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(OVERTIME_TYPES)
  overtimeType?: (typeof OVERTIME_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  departmentId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class OvertimeDetailDto {
  @ApiProperty() @IsUUID() id: string;
}
