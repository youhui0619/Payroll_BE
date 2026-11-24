import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { emptyStringAsUndefined } from '../common/transformers';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ReportYearQueryDto {
  @ApiPropertyOptional({ minimum: 2000, maximum: 2200 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;
}

export class PayslipHistoryQueryDto extends ReportYearQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}

export class DashboardQueryDto extends ReportYearQueryDto {}
