import { Injectable } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit, dateOnly, fail, localDate } from '../common/domain';
import { DateRangeDto } from '../workforce/workforce.dto';
import { PayslipHistoryQueryDto, ReportYearQueryDto } from './reports.dto';
import { csv } from './reports.utils';

@Injectable()
export class ReportsService {
  constructor(private db: Database) {}
  async dashboard(m: Membership) {
    const company = await this.db.company.findUniqueOrThrow({
      where: { id: m.companyId },
    });
    const today = dateOnly(localDate(new Date(), company.timezone));
    const payroll = await this.db.payrollRun.groupBy({
      by: ['status'],
      where: { companyId: m.companyId },
      _count: { _all: true },
    });
    const [employees, pendingLeave, pendingClaims, openSessions, holidays] =
      await this.db.$transaction([
        this.db.employee.count({
          where: { companyId: m.companyId, active: true },
        }),
        this.db.leaveRequest.count({
          where: {
            companyId: m.companyId,
            status: { in: ['PENDING_MANAGER', 'PENDING_HR'] },
          },
        }),
        this.db.claim.count({
          where: {
            companyId: m.companyId,
            status: { in: ['PENDING_MANAGER', 'PENDING_FINANCE'] },
          },
        }),
        this.db.attendanceSession.count({
          where: { companyId: m.companyId, clockOut: null },
        }),
        this.db.publicHoliday.findMany({
          where: {
            companyId: m.companyId,
            active: true,
            endDate: { gte: today },
          },
          orderBy: { startDate: 'asc' },
          take: 5,
        }),
      ]);
    return {
      data: {
        activeEmployees: employees,
        pendingLeave,
        pendingClaims,
        currentlyClockedIn: openSessions,
        payroll: payroll.map((r) => ({
          status: r.status,
          count: r._count._all,
        })),
        upcomingHolidays: holidays,
      },
    };
  }
  async attendance(m: Membership, q: DateRangeDto) {
    const start = dateOnly(q.from),
      end = dateOnly(q.to);
    if (end < start || end.getTime() - start.getTime() > 31 * 86400000)
      fail('INVALID_RANGE', 'Use at most 32 days.', 400);
    const rows = await this.db.attendanceSession.findMany({
      where: {
        companyId: m.companyId,
        date: { gte: start, lte: end },
      },
      include: { employee: { select: { employeeNo: true, name: true } } },
      orderBy: { clockIn: 'asc' },
      take: 10001,
    });
    if (rows.length > 10000)
      fail('EXPORT_TOO_LARGE', 'Narrow the export date range.', 400);
    await audit(this.db, m, 'ATTENDANCE_EXPORTED', m.companyId);
    return csv(
      [
        'Employee number',
        'Name',
        'Date',
        'Clock in (UTC)',
        'Clock out (UTC)',
        'Duration minutes',
        'Hours worked minutes',
        'Overtime minutes',
        'Remark',
      ],
      rows.map((r) => [
        r.employee.employeeNo,
        r.employee.name,
        r.date.toISOString().slice(0, 10),
        r.clockIn.toISOString(),
        r.clockOut?.toISOString(),
        r.durationMinutes ?? '',
        r.hoursWorkedMinutes ?? '',
        r.overtimeMinutes,
        r.remark ?? '',
      ]),
    );
  }
  async claims(m: Membership, q: DateRangeDto) {
    const start = dateOnly(q.from),
      end = dateOnly(q.to);
    if (end < start || end.getTime() - start.getTime() > 366 * 86400000)
      fail('INVALID_RANGE', 'Use at most one year.', 400);
    const rows = await this.db.claim.findMany({
      where: { companyId: m.companyId, date: { gte: start, lte: end } },
      include: {
        employee: { select: { employeeNo: true, name: true } },
        type: { select: { code: true } },
      },
      orderBy: { date: 'asc' },
      take: 10001,
    });
    if (rows.length > 10000)
      fail('EXPORT_TOO_LARGE', 'Narrow the export date range.', 400);
    await audit(this.db, m, 'CLAIMS_EXPORTED', m.companyId);
    return csv(
      [
        'Employee number',
        'Name',
        'Type',
        'Date',
        'Amount',
        'Status',
        'Payment method',
      ],
      rows.map((r) => [
        r.employee.employeeNo,
        r.employee.name,
        r.type.code,
        r.date.toISOString().slice(0, 10),
        r.amount.toFixed(2),
        r.status,
        r.paymentMethod,
      ]),
    );
  }

  async leaveBalances(m: Membership, q: ReportYearQueryDto) {
    const year = q.year ?? new Date().getUTCFullYear();
    const [employees, policies, ledger, pending] = await this.db.$transaction([
      this.db.employee.findMany({
        where: { companyId: m.companyId, active: true },
        select: { id: true, employeeNo: true, name: true },
        orderBy: [{ employeeNo: 'asc' }, { id: 'asc' }],
      }),
      this.db.leavePolicy.findMany({
        where: { companyId: m.companyId },
        select: { id: true, code: true, name: true, paid: true, active: true },
        orderBy: { code: 'asc' },
      }),
      this.db.leaveLedger.findMany({
        where: { companyId: m.companyId, year },
        select: { employeeId: true, policyId: true, days: true },
      }),
      this.db.leaveRequest.findMany({
        where: {
          companyId: m.companyId,
          paid: true,
          status: { in: ['PENDING_MANAGER', 'PENDING_HR'] },
          startDate: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
        select: { employeeId: true, policyId: true, days: true },
      }),
    ]);
    const balance = new Map<string, number>();
    for (const row of ledger) {
      const key = `${row.employeeId}:${row.policyId}`;
      balance.set(key, (balance.get(key) ?? 0) + Number(row.days));
    }
    const reserved = new Map<string, number>();
    for (const row of pending) {
      const key = `${row.employeeId}:${row.policyId}`;
      reserved.set(key, (reserved.get(key) ?? 0) + Number(row.days));
    }
    if (employees.length * policies.length > 100000)
      fail('EXPORT_TOO_LARGE', 'Narrow the employee or policy scope.', 400);
    const rows = employees.flatMap((employee) =>
      policies
        .filter(
          (policy) =>
            policy.active ||
            balance.has(`${employee.id}:${policy.id}`) ||
            reserved.has(`${employee.id}:${policy.id}`),
        )
        .map((policy) => {
          const key = `${employee.id}:${policy.id}`;
          const total = balance.get(key) ?? 0;
          const held = reserved.get(key) ?? 0;
          return [
            employee.employeeNo,
            employee.name,
            year,
            policy.code,
            policy.name,
            policy.paid,
            total.toFixed(2),
            held.toFixed(2),
            policy.paid ? (total - held).toFixed(2) : '',
          ];
        }),
    );
    if (rows.length > 100000)
      fail('EXPORT_TOO_LARGE', 'Narrow the employee or policy scope.', 400);
    await audit(this.db, m, 'LEAVE_BALANCES_EXPORTED', m.companyId, { year });
    return csv(
      [
        'Employee number',
        'Employee',
        'Year',
        'Policy code',
        'Policy',
        'Paid',
        'Balance',
        'Reserved',
        'Available',
      ],
      rows,
    );
  }

  async leaveApplications(m: Membership, q: DateRangeDto) {
    const start = dateOnly(q.from);
    const end = dateOnly(q.to);
    if (end < start || end.getTime() - start.getTime() > 366 * 86400000)
      fail('INVALID_RANGE', 'Use at most one year.', 400);
    const rows = await this.db.leaveRequest.findMany({
      where: {
        companyId: m.companyId,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: {
        employee: { select: { employeeNo: true, name: true } },
        policy: { select: { code: true, name: true } },
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      take: 10001,
    });
    if (rows.length > 10000)
      fail('EXPORT_TOO_LARGE', 'Narrow the leave date range.', 400);
    await audit(this.db, m, 'LEAVE_APPLICATIONS_EXPORTED', m.companyId, {
      from: q.from,
      to: q.to,
    });
    return csv(
      [
        'Employee number',
        'Employee',
        'Policy code',
        'Policy',
        'Start date',
        'End date',
        'Days',
        'Paid',
        'Status',
        'Reason',
        'Decision comment',
      ],
      rows.map((row) => [
        row.employee.employeeNo,
        row.employee.name,
        row.policy.code,
        row.policy.name,
        row.startDate.toISOString().slice(0, 10),
        row.endDate.toISOString().slice(0, 10),
        row.days.toFixed(2),
        row.paid,
        row.status,
        row.reason,
        row.decisionComment ?? '',
      ]),
    );
  }

  async payslipHistory(m: Membership, q: PayslipHistoryQueryDto) {
    const rows = await this.db.payrollEmployee.findMany({
      where: {
        companyId: m.companyId,
        run: {
          ...(q.year !== undefined ? { year: q.year } : {}),
          ...(q.month !== undefined ? { month: q.month } : {}),
          status: { in: ['PUBLISHED', 'PAID'] },
        },
      },
      include: {
        employee: { select: { employeeNo: true, name: true } },
        run: {
          select: { year: true, month: true, status: true, paidAt: true },
        },
      },
      orderBy: [
        { run: { year: 'desc' } },
        { run: { month: 'desc' } },
        { employee: { employeeNo: 'asc' } },
      ],
      take: 10001,
    });
    if (rows.length > 10000)
      fail('EXPORT_TOO_LARGE', 'Narrow the payslip history filters.', 400);
    await audit(this.db, m, 'PAYSLIP_HISTORY_EXPORTED', m.companyId, {
      year: q.year ?? null,
      month: q.month ?? null,
    });
    return csv(
      [
        'Employee number',
        'Employee',
        'Year',
        'Month',
        'Status',
        'Payslip number',
        'Gross pay',
        'Deductions',
        'Employer contributions',
        'Net pay',
        'Paid at',
      ],
      rows.map((row) => [
        row.employee.employeeNo,
        row.employee.name,
        row.run.year,
        row.run.month,
        row.run.status,
        row.payslipNumber ?? '',
        row.gross.toFixed(2),
        row.deductions.toFixed(2),
        row.employerContributions.toFixed(2),
        row.net.toFixed(2),
        row.run.paidAt?.toISOString() ?? '',
      ]),
    );
  }
}
