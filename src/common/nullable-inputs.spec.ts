import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LeaveApproval } from '@prisma/client';
import { AttendanceAdjustmentQueryDto } from '../attendance/attendance.dto';
import { ClaimTypeDto } from '../claims/claims.dto';
import {
  CommissionRecordDto,
  CommissionSettingDto,
} from '../commission/commission.dto';
import { CreateEmployeeDto } from '../employees/employees.dto';
import { EmployeeImportRowDto } from '../employees/employee-import.dto';
import { FileQueryDto } from '../files/files.dto';
import {
  LeaveBalanceQueryDto,
  LeaveDto,
  LeavePolicyDto,
} from '../leave/leave.dto';
import {
  CompanyDto,
  DepartmentDto,
  PositionDto,
} from '../organization/organization.dto';
import { OvertimeQueryDto } from '../overtime/overtime.dto';
import { PayrollSettingsDto } from '../payroll/payroll.dto';
import { ReportYearQueryDto } from '../reports/reports.dto';
import {
  NotificationSettingsDto,
  RegionalSettingsDto,
} from '../settings/settings.dto';
import { HolidayQueryDto } from '../workforce/workforce.dto';
import { PageDto } from './page.dto';

async function expectValid(value: object) {
  await expect(validate(value)).resolves.toEqual([]);
}

describe('nullable input normalization', () => {
  it('normalizes blank nullable values before validation', async () => {
    const claimType = plainToInstance(ClaimTypeDto, {
      code: 'TRAVEL',
      name: 'Travel',
      description: '',
      maxAmount: '',
      effectiveFrom: '',
      effectiveTo: '',
    });
    expect(claimType.description).toBeNull();
    expect(claimType.maxAmount).toBeNull();
    expect(claimType.effectiveFrom).toBeNull();
    expect(claimType.effectiveTo).toBeNull();
    await expectValid(claimType);

    const commissionSetting = plainToInstance(CommissionSettingDto, {
      code: 'SALES',
      name: 'Sales commission',
      commissionType: 'SALES_COMMISSION',
      calculationMethod: 'PERCENTAGE_OF_SALES',
      rate: '',
      amount: '',
      description: '',
      payrollEarningCode: 'COMM',
    });
    expect(commissionSetting.rate).toBeNull();
    expect(commissionSetting.amount).toBeNull();
    expect(commissionSetting.description).toBeNull();
    await expectValid(commissionSetting);

    const commissionRecord = plainToInstance(CommissionRecordDto, {
      employeeId: '11111111-1111-4111-8111-111111111111',
      calculationBasis: '',
      referenceId: '',
      notes: '',
    });
    expect(commissionRecord.calculationBasis).toBeNull();
    expect(commissionRecord.referenceId).toBeNull();
    expect(commissionRecord.notes).toBeNull();
    await expectValid(commissionRecord);

    const employee = plainToInstance(CreateEmployeeDto, {
      employeeNo: 'E-001',
      name: 'Employee',
      joinedDate: '2026-01-01',
      dateOfBirth: '',
      confirmationDate: '',
      resignationDate: '',
      basicSalary: '',
    });
    expect(employee.dateOfBirth).toBeNull();
    expect(employee.confirmationDate).toBeNull();
    expect(employee.resignationDate).toBeNull();
    expect(employee.basicSalary).toBeNull();
    await expectValid(employee);

    const leavePolicy = plainToInstance(LeavePolicyDto, {
      code: 'AL',
      name: 'Annual Leave',
      approval: LeaveApproval.HR_ONLY,
      effectiveFrom: '2026-01-01',
      defaultEntitlement: '',
      maximumCarryForward: '',
      serviceEntitlementTiers: [
        { serviceFrom: '', serviceTo: '', daysPerYear: '' },
      ],
    });
    expect(leavePolicy.defaultEntitlement).toBeNull();
    expect(leavePolicy.maximumCarryForward).toBeNull();
    expect(leavePolicy.serviceEntitlementTiers?.[0]).toEqual({
      serviceFrom: null,
      serviceTo: null,
      daysPerYear: null,
    });
    await expectValid(leavePolicy);

    const leave = plainToInstance(LeaveDto, {
      policyId: '11111111-1111-4111-8111-111111111111',
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      reason: 'Personal leave',
      reference: '',
    });
    expect(leave.reference).toBeNull();
    await expectValid(leave);

    const department = plainToInstance(DepartmentDto, {
      code: 'HR',
      name: 'Human Resources',
      parentDepartmentId: '',
      headOfDepartmentId: '',
      effectiveFrom: '',
      effectiveTo: '',
    });
    expect(department.parentDepartmentId).toBeNull();
    expect(department.headOfDepartmentId).toBeNull();
    expect(department.effectiveFrom).toBeNull();
    expect(department.effectiveTo).toBeNull();
    await expectValid(department);

    const position = plainToInstance(PositionDto, {
      code: 'HR-EXEC',
      title: 'HR Executive',
      departmentId: '',
      reportsTo: '',
      effectiveFrom: '',
      effectiveTo: '',
    });
    expect(position.departmentId).toBeNull();
    expect(position.reportsTo).toBeNull();
    expect(position.effectiveFrom).toBeNull();
    expect(position.effectiveTo).toBeNull();
    await expectValid(position);

    const payrollSettings = plainToInstance(PayrollSettingsDto, {
      currency: 'MYR',
      standardWorkingHoursPerDay: '',
      normalWorkingDayMultiplier: '',
      restDayOvertimeMultiplier: '',
      publicHolidayOvertimeMultiplier: '',
    });
    expect(payrollSettings.standardWorkingHoursPerDay).toBeNull();
    expect(payrollSettings.normalWorkingDayMultiplier).toBeNull();
    expect(payrollSettings.restDayOvertimeMultiplier).toBeNull();
    expect(payrollSettings.publicHolidayOvertimeMultiplier).toBeNull();
    await expectValid(payrollSettings);

    const attendanceQuery = plainToInstance(AttendanceAdjustmentQueryDto, {
      status: '',
      employeeId: '',
      from: '',
      to: '',
    });
    await expectValid(attendanceQuery);

    const fileQuery = plainToInstance(FileQueryDto, {
      employeeId: '',
      claimId: '',
      category: '',
    });
    await expectValid(fileQuery);

    const overtimeQuery = plainToInstance(OvertimeQueryDto, {
      status: '',
      overtimeType: '',
      departmentId: '',
      employeeId: '',
      from: '',
      to: '',
    });
    await expectValid(overtimeQuery);

    const employeeImport = plainToInstance(EmployeeImportRowDto, {
      employeeNo: 'E-001',
      name: 'Employee',
      joinedDate: '2026-01-01',
      email: '',
      departmentId: '',
      positionId: '',
      basicSalary: '',
      salaryType: '',
    });
    await expectValid(employeeImport);

    const company = plainToInstance(CompanyDto, {
      name: '',
      email: '',
      financialYearStartMonth: '',
      businessCity: '',
    });
    await expectValid(company);

    const notifications = plainToInstance(NotificationSettingsDto, {
      emailNotifications: '',
      probationConfirmationLeadMonths: '',
    });
    await expectValid(notifications);

    const regional = plainToInstance(RegionalSettingsDto, {
      language: '',
      currency: '',
      numberFormat: '',
    });
    await expectValid(regional);

    const page = plainToInstance(PageDto, { page: '', pageSize: '' });
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
    await expectValid(page);

    await expectValid(plainToInstance(HolidayQueryDto, { year: '' }));
    await expectValid(plainToInstance(LeaveBalanceQueryDto, { year: '' }));
    await expectValid(plainToInstance(ReportYearQueryDto, { year: '' }));
  });
});
