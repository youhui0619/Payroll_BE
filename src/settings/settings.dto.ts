import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class NotificationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  whatsappNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() leaveApplications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() claims?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  attendanceOvertime?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  payrollPayslips?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  statutoryCompliance?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  probationConfirmation?: boolean;
  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  probationConfirmationLeadMonths?: number;
}

export class RegionalSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  language?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  timeZone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  dateFormat?: string;
  @ApiPropertyOptional({ enum: ['12h', '24h'] })
  @IsOptional()
  @IsIn(['12h', '24h'])
  timeFormat?: string;
  @ApiPropertyOptional({ example: 'MYR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @ApiPropertyOptional({ enum: ['1,234.56', '1.234,56'] })
  @IsOptional()
  @IsIn(['1,234.56', '1.234,56'])
  numberFormat?: string;
}

export class PayslipSettingsDto {
  @ApiPropertyOptional({ enum: ['A4', 'LETTER'] })
  @IsOptional()
  @IsIn(['A4', 'LETTER'])
  pageSize?: string;
  @ApiPropertyOptional({ enum: ['PORTRAIT', 'LANDSCAPE'] })
  @IsOptional()
  @IsIn(['PORTRAIT', 'LANDSCAPE'])
  pageOrientation?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  payslipNumberFormat?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  pdfFilenameFormat?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  passwordProtectedPdf?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() companyLogo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() employeeDetails?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  departmentAndPosition?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() employmentType?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  payPeriodAndPaymentDate?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  salaryAndEarnings?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  itemizedDeductions?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  employerContributions?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  yearToDateTotals?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() leaveBalance?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  employeeExpensesList?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dailyAttendanceRecord?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() leaveList?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bankAccountDetails?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  maskBankAccountNumber?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  displayFooterMessage?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  footerText?: string;
  @ApiPropertyOptional({ enum: ['MANUAL', 'AUTOMATIC'] })
  @IsOptional()
  @IsIn(['MANUAL', 'AUTOMATIC'])
  publishingMethod?: string;
  @ApiPropertyOptional({ enum: ['EMPLOYEES_AND_ADMINS', 'ADMINS_ONLY'] })
  @IsOptional()
  @IsIn(['EMPLOYEES_AND_ADMINS', 'ADMINS_ONLY'])
  employeeVisibility?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyEmployees?: boolean;
}
