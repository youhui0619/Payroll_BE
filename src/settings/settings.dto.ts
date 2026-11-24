import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { emptyStringAsUndefined } from '../common/transformers';

export class NotificationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  emailNotifications?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  whatsappNotifications?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  leaveApplications?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  claims?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  attendanceOvertime?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  payrollPayslips?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  statutoryCompliance?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  probationConfirmation?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsInt()
  @Min(1)
  @Max(12)
  probationConfirmationLeadMonths?: number;
}

export class RegionalSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 20)
  language?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 80)
  timeZone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 50)
  dateFormat?: string;
  @ApiPropertyOptional({ enum: ['12h', '24h'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['12h', '24h'])
  timeFormat?: string;
  @ApiPropertyOptional({ example: 'MYR' })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @ApiPropertyOptional({ enum: ['1,234.56', '1.234,56'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['1,234.56', '1.234,56'])
  numberFormat?: string;
}

export class PayslipSettingsDto {
  @ApiPropertyOptional({ enum: ['A4', 'LETTER'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['A4', 'LETTER'])
  pageSize?: string;
  @ApiPropertyOptional({ enum: ['PORTRAIT', 'LANDSCAPE'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['PORTRAIT', 'LANDSCAPE'])
  pageOrientation?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 200)
  payslipNumberFormat?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @Length(1, 200)
  pdfFilenameFormat?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  passwordProtectedPdf?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  companyLogo?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  employeeDetails?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  departmentAndPosition?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  employmentType?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  payPeriodAndPaymentDate?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  salaryAndEarnings?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  itemizedDeductions?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  employerContributions?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  yearToDateTotals?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  leaveBalance?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  employeeExpensesList?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  dailyAttendanceRecord?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  leaveList?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  bankAccountDetails?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  maskBankAccountNumber?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  displayFooterMessage?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsString()
  @MaxLength(2000)
  footerText?: string;
  @ApiPropertyOptional({ enum: ['MANUAL', 'AUTOMATIC'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['MANUAL', 'AUTOMATIC'])
  publishingMethod?: string;
  @ApiPropertyOptional({ enum: ['EMPLOYEES_AND_ADMINS', 'ADMINS_ONLY'] })
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsIn(['EMPLOYEES_AND_ADMINS', 'ADMINS_ONLY'])
  employeeVisibility?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringAsUndefined)
  @IsBoolean()
  notifyEmployees?: boolean;
}
