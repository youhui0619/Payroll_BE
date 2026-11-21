import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PageDto } from '../common/page.dto';

export class PayrollRosterQueryDto extends PageDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Repeat departmentIds for multiple departments. Omit for all departments.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  departmentIds?: string[];
}

export class PayrollRosterEmployeeDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Internal employee ID for API calls, not the display employee number.',
  })
  employeeId: string;
  @ApiProperty({ example: 'EMP-0042' }) employeeNo: string;
  @ApiProperty() employee: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) departmentId: string | null;
  @ApiProperty({ nullable: true }) department: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) positionId: string | null;
  @ApiProperty({ nullable: true }) position: string | null;
}

class PayrollRosterMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
  @ApiProperty({
    description:
      'Matching employees across all pages after search and department filtering.',
  })
  total: number;
  @ApiProperty() totalPages: number;
  @ApiProperty({ format: 'uuid' }) runId: string;
  @ApiProperty() year: number;
  @ApiProperty() month: number;
  @ApiProperty({ enum: ['DRAFT'] }) runStatus: string;
  @ApiProperty({
    enum: [false],
    description: 'Roster only; no payroll results are calculated or persisted.',
  })
  complete: boolean;
}

export class PayrollRosterResponseDto {
  @ApiProperty({ type: [PayrollRosterEmployeeDto] })
  data: PayrollRosterEmployeeDto[];
  @ApiProperty({ type: PayrollRosterMetaDto }) meta: PayrollRosterMetaDto;
}
