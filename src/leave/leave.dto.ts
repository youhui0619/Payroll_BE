import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { LeaveApproval } from '@prisma/client';
import { Type } from 'class-transformer';

export class LeaveBalanceQueryDto {
  @ApiPropertyOptional({
    minimum: 2000,
    maximum: 2200,
    description: 'Defaults to the current year in the company timezone.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;
}

export class LeaveBalanceItemDto {
  @ApiProperty() policyId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() year: number;
  @ApiProperty() paid: boolean;
  @ApiProperty() active: boolean;
  @ApiProperty({
    example: '14.00',
    description: 'Posted ledger total, after approved usage and reversals.',
  })
  balance: string;
  @ApiProperty({
    example: '2.00',
    description: 'Paid leave awaiting manager or HR approval.',
  })
  reserved: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: '12.00',
    description: 'Posted balance minus reservations. Null for unpaid leave.',
  })
  available: string | null;
}
export class LeaveBalanceMetaDto {
  @ApiProperty() year: number;
  @ApiProperty() employeeId: string;
}
export class LeaveBalanceResponseDto {
  @ApiProperty({ type: [LeaveBalanceItemDto] }) data: LeaveBalanceItemDto[];
  @ApiProperty({ type: LeaveBalanceMetaDto }) meta: LeaveBalanceMetaDto;
}
export class LeavePolicyDto {
  @ApiProperty() @IsString() @Length(1, 30) code: string;
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiProperty({ default: true }) @IsBoolean() paid = true;
  @ApiProperty({ example: '14.00' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/)
  annualDays: string;
  @ApiProperty({ default: false }) @IsBoolean() allowHalfDay = false;
  @ApiProperty({ default: 0 }) @IsInt() @Min(0) @Max(365) noticeDays = 0;
  @ApiProperty({ enum: LeaveApproval })
  @IsEnum(LeaveApproval)
  approval: LeaveApproval;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string;
}
export class LeaveDto {
  @ApiProperty() @IsUUID() policyId: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate: string;
  @ApiProperty({ default: false }) @IsBoolean() halfDay = false;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class GrantDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty() @IsUUID() policyId: string;
  @ApiProperty() @IsInt() @Min(2000) @Max(2200) year: number;
  @ApiProperty({ example: '14.00' })
  @IsString()
  @Matches(/^-?(0|[1-9]\d{0,2})(\.\d{1,2})?$/)
  days: string;
  @ApiProperty() @IsString() @Length(1, 500) reason: string;
  @ApiProperty() @IsUUID() idempotencyKey: string;
}
