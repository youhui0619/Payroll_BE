import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { RequestStatus } from '@prisma/client';
import { PageDto } from '../common/page.dto';

export class ClaimTypeDto {
  @ApiProperty() @IsString() @Length(1, 30) code: string;
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string | null;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  receiptRequired?: boolean;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Per-claim maximum, or null for no limit.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/)
  maxAmount?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string | null;
}

export class ClaimDto {
  @ApiProperty() @IsUUID() typeId: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiProperty({ example: '25.50' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/)
  amount: string;

  @ApiProperty() @IsString() @Length(1, 2000) description: string;
  @ApiProperty({ enum: ['PAYROLL', 'BANK_TRANSFER'] })
  @IsIn(['PAYROLL', 'BANK_TRANSFER'])
  paymentMethod: string;
}

export class PayClaimDto {
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  paymentReference: string;
}

export class ClaimQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() typeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
