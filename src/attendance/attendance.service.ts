import { Injectable } from '@nestjs/common';
import { Database } from '../database.module';
import { Membership } from '@prisma/client';
import {
  audit,
  dateOnly,
  fail,
  localDate,
  selfEmployee,
} from '../common/domain';
import { DateRangeDto } from '../workforce/workforce.dto';
import { AttendanceCalendarQueryDto } from './attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private db: Database) {}
  async clock(
    m: Membership,
    key: string,
    direction: 'IN' | 'OUT',
    remark?: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const employee = await selfEmployee(tx, m);
        const where = { companyId: m.companyId, employeeId: employee.id };
        const replay = await tx.attendanceSession.findFirst({
          where: {
            ...where,
            ...(direction === 'IN'
              ? { clockInKey: key }
              : { clockOutKey: key }),
          },
        });
        if (replay) return { data: replay };
        const open = await tx.attendanceSession.findFirst({
          where: { ...where, clockOut: null },
        });
        if (direction === 'IN' && open)
          fail(
            'ALREADY_CLOCKED_IN',
            'Clock out before starting another session.',
            409,
          );
        if (direction === 'OUT' && !open)
          fail('NOT_CLOCKED_IN', 'There is no open attendance session.', 409);
        const now = new Date();
        const company = await tx.company.findUniqueOrThrow({
          where: { id: m.companyId },
        });
        const data =
          direction === 'IN'
            ? await tx.attendanceSession.create({
                data: {
                  ...where,
                  date: dateOnly(localDate(now, company.timezone)),
                  clockIn: now,
                  clockInKey: key,
                },
              })
            : await (async () => {
                const durationMinutes = Math.max(
                  0,
                  Math.floor((now.getTime() - open.clockIn.getTime()) / 60000),
                );
                const schedule = employee.scheduleId
                  ? await tx.workSchedule.findFirst({
                      where: {
                        id: employee.scheduleId,
                        companyId: m.companyId,
                        active: true,
                      },
                    })
                  : null;
                const hoursWorkedMinutes = schedule
                  ? Math.max(0, durationMinutes - schedule.breakMinutes)
                  : durationMinutes;
                const scheduledMinutes = schedule
                  ? Math.max(
                      0,
                      ((schedule.endMinute - schedule.startMinute + 1440) %
                        1440 || 1440) - schedule.breakMinutes,
                    )
                  : 0;
                const overtimeMinutes = schedule
                  ? Math.max(0, hoursWorkedMinutes - scheduledMinutes)
                  : 0;
                return tx.attendanceSession.update({
                  where: { id: open.id },
                  data: {
                    clockOut: now,
                    clockOutKey: key,
                    durationMinutes,
                    hoursWorkedMinutes,
                    overtimeMinutes,
                    ...(remark !== undefined
                      ? { remark: remark.trim() || null }
                      : {}),
                  },
                });
              })();
        await audit(
          tx,
          m,
          direction === 'IN' ? 'CLOCK_IN' : 'CLOCK_OUT',
          data.id,
        );
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async status(m: Membership) {
    const employee = await selfEmployee(this.db, m);
    return {
      data: await this.db.attendanceSession.findFirst({
        where: {
          companyId: m.companyId,
          employeeId: employee.id,
          clockOut: null,
        },
      }),
    };
  }
  async history(m: Membership, q: DateRangeDto, all = false) {
    const start = dateOnly(q.from),
      end = dateOnly(q.to);
    if (end < start || end.getTime() - start.getTime() > 31 * 86400000)
      fail('INVALID_RANGE', 'Use a date range of at most 32 days.', 400);
    const employeeId = all ? undefined : (await selfEmployee(this.db, m)).id;
    // UTC interval; sessions overlapping it are returned, including overnight shifts.
    const rows = await this.db.attendanceSession.findMany({
      where: {
        companyId: m.companyId,
        employeeId,
        date: { gte: start, lte: end },
      },
      orderBy: { clockIn: 'desc' },
      take: 1000,
    });
    return {
      data: rows.map((row) => ({
        ...row,
        durationMinutes: row.durationMinutes,
        hoursWorkedMinutes: row.hoursWorkedMinutes,
        overtimeMinutes: row.overtimeMinutes,
        remark: row.remark,
        workedMinutes: row.durationMinutes,
      })),
      meta: { limit: 1000 },
    };
  }

  async calendar(m: Membership, q: AttendanceCalendarQueryDto, all = false) {
    const start = new Date(Date.UTC(q.year, q.month - 1, 1));
    const end = new Date(Date.UTC(q.year, q.month, 0));
    const next = new Date(Date.UTC(q.year, q.month, 1));
    const employee = all ? null : await selfEmployee(this.db, m);
    const employeeWhere = employee
      ? { id: employee.id }
      : {
          ...(q.departmentId ? { departmentId: q.departmentId } : {}),
          active: true,
        };
    const employees = await this.db.employee.findMany({
      where: { companyId: m.companyId, ...employeeWhere },
      select: {
        id: true,
        employeeNo: true,
        name: true,
        departmentId: true,
        department: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ employeeNo: 'asc' }, { id: 'asc' }],
      take: 501,
    });
    if (employees.length > 500)
      fail(
        'ATTENDANCE_CALENDAR_TOO_LARGE',
        'Narrow the calendar to a department.',
        400,
      );
    const employeeIds = employees.map((row) => row.id);
    const [sessions, leaves, overtime, holidays] = await this.db.$transaction([
      this.db.attendanceSession.findMany({
        where: {
          companyId: m.companyId,
          employeeId: { in: employeeIds },
          date: { gte: start, lte: end },
        },
        orderBy: { clockIn: 'asc' },
      }),
      this.db.leaveRequest.findMany({
        where: {
          companyId: m.companyId,
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          startDate: { lt: next },
          endDate: { gte: start },
        },
        include: { policy: { select: { code: true, name: true } } },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
      this.db.overtimeRequest.findMany({
        where: {
          companyId: m.companyId,
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          overtimeDate: { gte: start, lte: end },
        },
        orderBy: [{ overtimeDate: 'asc' }, { id: 'asc' }],
      }),
      this.db.publicHoliday.findMany({
        where: {
          companyId: m.companyId,
          active: true,
          startDate: { lte: end },
          endDate: { gte: start },
        },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const dateKeys = Array.from({ length: end.getUTCDate() }, (_, index) => {
      const date = new Date(Date.UTC(q.year, q.month - 1, index + 1));
      return date.toISOString().slice(0, 10);
    });
    const dateOf = (date: Date) => date.toISOString().slice(0, 10);
    const rows = employees.map((person) => {
      const personSessions = sessions.filter(
        (row) => row.employeeId === person.id,
      );
      const personLeaves = leaves.filter((row) => row.employeeId === person.id);
      const personOvertime = overtime.filter(
        (row) => row.employeeId === person.id,
      );
      const days = dateKeys.map((date) => {
        const attendance = personSessions.find(
          (row) => dateOf(row.date) === date,
        );
        const leave = personLeaves.find(
          (row) => date >= dateOf(row.startDate) && date <= dateOf(row.endDate),
        );
        const overtimeRow = personOvertime.find(
          (row) => dateOf(row.overtimeDate) === date,
        );
        const holiday = holidays.find(
          (row) => date >= dateOf(row.startDate) && date <= dateOf(row.endDate),
        );
        return {
          date,
          attendance: attendance
            ? {
                id: attendance.id,
                clockIn: attendance.clockIn.toISOString(),
                clockOut: attendance.clockOut?.toISOString() ?? null,
                durationMinutes: attendance.durationMinutes,
                hoursWorkedMinutes: attendance.hoursWorkedMinutes,
                overtimeMinutes: attendance.overtimeMinutes,
                remark: attendance.remark,
              }
            : null,
          leave: leave
            ? {
                id: leave.id,
                reference: leave.reference,
                policyCode: leave.policy.code,
                policyName: leave.policy.name,
                paid: leave.paid,
                days: leave.days.toFixed(2),
                halfDay: leave.halfDay,
                status: leave.status,
                reason: leave.reason,
              }
            : null,
          overtime: overtimeRow
            ? {
                id: overtimeRow.id,
                netMinutes: overtimeRow.netMinutes,
                overtimeType: overtimeRow.overtimeType,
                earningCode: overtimeRow.earningCode,
                status: overtimeRow.status,
              }
            : null,
          holiday: holiday
            ? { id: holiday.id, name: holiday.name, scope: holiday.scope }
            : null,
        };
      });
      return {
        employeeId: person.id,
        employeeNo: person.employeeNo,
        employee: person.name,
        departmentId: person.departmentId,
        department: person.department,
        days,
        summary: {
          presentDays: days.filter((day) => !!day.attendance).length,
          leaveDays: days.filter((day) => !!day.leave).length,
          overtimeMinutes: days.reduce(
            (sum, day) =>
              sum +
              (day.attendance?.overtimeMinutes ??
                day.overtime?.netMinutes ??
                0),
            0,
          ),
          workedMinutes: days.reduce(
            (sum, day) => sum + (day.attendance?.hoursWorkedMinutes ?? 0),
            0,
          ),
        },
      };
    });
    return {
      data: {
        year: q.year,
        month: q.month,
        startDate: dateKeys[0],
        endDate: dateKeys.at(-1),
        employees: rows,
      },
    };
  }
}
