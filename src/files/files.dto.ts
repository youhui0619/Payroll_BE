import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageDto } from '../common/page.dto';

export type Upload = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};
export class UploadDto {
  @ApiPropertyOptional({
    enum: ['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'],
  })
  @IsIn(['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'])
  category = 'EMPLOYEE_DOCUMENT';
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() claimId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leaveRequestId?: string;
}
export class FileQueryDto extends PageDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() claimId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leaveRequestId?: string;
  @ApiPropertyOptional({
    enum: ['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'],
  })
  @IsOptional()
  @IsIn(['EMPLOYEE_DOCUMENT', 'CLAIM_RECEIPT', 'LEAVE_DOCUMENT'])
  category?: string;
}
