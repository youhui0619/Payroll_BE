import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class OvertimeAllocationDto {
  @ApiProperty({
    description: 'Why the overtime record is being allocated or released.',
  })
  @IsString()
  @Length(1, 1000)
  reason: string;
}

class OvertimeAllocationDataDto {
  @ApiProperty({ format: 'uuid' }) requestId: string;
  @ApiProperty({ format: 'uuid', nullable: true }) runId: string | null;
  @ApiProperty() earningCode: string;
  @ApiProperty() netMinutes: number;
  @ApiProperty() hourlyRateMultiplier: number;
}

export class OvertimeAllocationResponseDto {
  @ApiProperty({ type: OvertimeAllocationDataDto })
  data: OvertimeAllocationDataDto;
}

class OvertimeAllocationEventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) requestId: string;
  @ApiProperty({ format: 'uuid' }) runId: string;
  @ApiProperty({ format: 'uuid' }) actorId: string;
  @ApiProperty({ enum: ['ALLOCATED', 'RELEASED'] }) action: string;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class OvertimeAllocationHistoryDto {
  @ApiProperty({ type: [OvertimeAllocationEventDto] })
  data: OvertimeAllocationEventDto[];

  @ApiProperty({
    type: 'object',
    properties: {
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      total: { type: 'integer' },
      totalPages: { type: 'integer' },
    },
  })
  meta: Record<string, number>;
}
