import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CommissionAllocationDto {
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
class CommissionAllocationDataDto {
  @ApiProperty({ format: 'uuid' }) recordId: string;
  @ApiProperty({ format: 'uuid', nullable: true }) runId: string | null;
  @ApiProperty() componentCode: string;
}
export class CommissionAllocationResponseDto {
  @ApiProperty({ type: CommissionAllocationDataDto })
  data: CommissionAllocationDataDto;
}
class CommissionAllocationEventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) recordId: string;
  @ApiProperty({ format: 'uuid' }) runId: string;
  @ApiProperty({ format: 'uuid' }) actorId: string;
  @ApiProperty({ enum: ['ALLOCATED', 'RELEASED'] }) action: string;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class CommissionAllocationHistoryDto {
  @ApiProperty({ type: [CommissionAllocationEventDto] })
  data: CommissionAllocationEventDto[];
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
