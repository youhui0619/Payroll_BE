import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageDto } from '../common/page.dto';
import { emptyStringAsUndefined } from '../common/transformers';

export type Upload = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};
export class UploadDto {
  @ApiPropertyOptional({
    enum: [
      'EMPLOYEE_DOCUMENT',
      'CLAIM_RECEIPT',
      'LEAVE_DOCUMENT',
      'OVERTIME_DOCUMENT',
      'COMPANY_LOGO',
    ],
  })
  @Transform(({ value }) => (value === '' ? 'EMPLOYEE_DOCUMENT' : value))
  @IsIn([
    'EMPLOYEE_DOCUMENT',
    'CLAIM_RECEIPT',
    'LEAVE_DOCUMENT',
    'OVERTIME_DOCUMENT',
    'COMPANY_LOGO',
  ])
  category = 'EMPLOYEE_DOCUMENT';
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  employeeId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  claimId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  leaveRequestId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  overtimeRequestId?: string;
}
export class FileQueryDto extends PageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  employeeId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  claimId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  leaveRequestId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsUUID()
  overtimeRequestId?: string;
  @ApiPropertyOptional({
    enum: [
      'EMPLOYEE_DOCUMENT',
      'CLAIM_RECEIPT',
      'LEAVE_DOCUMENT',
      'OVERTIME_DOCUMENT',
      'COMPANY_LOGO',
    ],
  })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn([
    'EMPLOYEE_DOCUMENT',
    'CLAIM_RECEIPT',
    'LEAVE_DOCUMENT',
    'OVERTIME_DOCUMENT',
    'COMPANY_LOGO',
  ])
  category?: string;
}
