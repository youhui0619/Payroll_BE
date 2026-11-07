import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { audit, dateOnly, fail, localDate } from '../common/domain';
import { DateRangeDto } from '../workforce/workforce.dto';
export function csvCell(value: unknown) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function csv(headers: string[], rows: unknown[][]) {
  return (
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  );
}
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
        clockIn: { gte: start, lt: new Date(end.getTime() + 86400000) },
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
        'Clock in (UTC)',
        'Clock out (UTC)',
        'Worked minutes',
      ],
      rows.map((r) => [
        r.employee.employeeNo,
        r.employee.name,
        r.clockIn.toISOString(),
        r.clockOut?.toISOString(),
        r.clockOut
          ? Math.floor((r.clockOut.getTime() - r.clockIn.getTime()) / 60000)
          : '',
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
}
@ApiBearerAuth()
@ApiTags('reports')
@Roles('OWNER', 'HR', 'FINANCE')
@Controller()
export class ReportsController {
  constructor(private service: ReportsService) {}
  @Get('dashboard') dashboard(@Req() r: TenantRequest) {
    return this.service.dashboard(r.membership);
  }
  @Get('reports/attendance.csv') @Roles('OWNER', 'HR') async attendance(
    @Req() r: TenantRequest,
    @Query() q: DateRangeDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment('attendance.csv')
      .send(await this.service.attendance(r.membership, q));
  }
  @Get('reports/claims.csv') async claims(
    @Req() r: TenantRequest,
    @Query() q: DateRangeDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment('claims.csv')
      .send(await this.service.claims(r.membership, q));
  }
}
@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
