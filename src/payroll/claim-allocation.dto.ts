import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class ClaimAllocationReasonDto {
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class ClaimAllocationDto extends ClaimAllocationReasonDto {
  @ApiProperty({ example: 'REIMBURSEMENT' })
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  componentCode: string;
}
export class ClaimAllocationDataDto {
  @ApiProperty({ format: 'uuid' }) claimId: string;
  @ApiProperty({ format: 'uuid', nullable: true }) runId: string | null;
  @ApiProperty({ nullable: true }) componentCode: string | null;
}
export class ClaimAllocationResponseDto {
  @ApiProperty({ type: ClaimAllocationDataDto }) data: ClaimAllocationDataDto;
}
