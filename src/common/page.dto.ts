import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { emptyStringAsUndefined } from './transformers';
export class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @Transform(({ value }) => (value === '' ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Transform(({ value }) => (value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;
}
export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary?: {
    statusCounts?: Record<string, number>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function paginated<T>(
  data: T[],
  total: number,
  q: PageDto,
  additionalMeta: Record<string, unknown> = {},
): { data: T[]; meta: PaginationMeta } {
  return {
    data,
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
      ...additionalMeta,
    },
  };
}
