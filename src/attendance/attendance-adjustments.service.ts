import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Membership, Prisma, RequestStatus } from '@prisma/client';
import { Database } from '../database.module';
import {
  audit,
  dateOnly,
  decisionComment,
  fail,
  privileged,
  selfEmployee,
} from '../common/domain';
import { paginated } from '../common/page.dto';
import {
  AttendanceAdjustmentDto,
  AttendanceAdjustmentQueryDto,
  AttendanceCorrectionDto,
} from './attendance.dto';

const serializable = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

const parseDateTime = (value?: string) =>
  value === undefined ? undefined : new Date(value);

@Injectable()
export class AttendanceAdjustmentsService {
  constructor(private db: Database) {}

  private validateTimes(dto: AttendanceAdjustmentDto) {
    if (!dto.requestedClockIn && !dto.requestedClockOut)
      fail(
        'ATTENDANCE_TIME_REQUIRED',
        'Provide at least one requested clock time.',
        400,
      );
    const clockIn = parseDateTime(dto.requestedClockIn);
    const clockOut = parseDateTime(dto.requestedClockOut);
    if (clockIn && Number.isNaN(clockIn.getTime()))
      fail('INVALID_ATTENDANCE_TIME', 'Requested clock-in is invalid.', 400);
    if (clockOut && Number.isNaN(clockOut.getTime()))
      fail('INVALID_ATTENDANCE_TIME', 'Requested clock-out is invalid.', 400);
    if (clockIn && clockOut && clockOut <= clockIn)
      fail(
        'INVALID_ATTENDANCE_TIME',
        'Requested clock-out must be later than requested clock-in.',
        422,
      );
    return { clockIn, clockOut };
  }

  private async assertUnlocked(
    tx: Prisma.TransactionClient,
    companyId: string,
    date: Date,
  ) {
    const run = await tx.payrollRun.findFirst({
      where: {
        companyId,
        status: { not: 'DRAFT' },
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
      },
      select: { id: true },
    });
    if (run)
      fail(
        'ATTENDANCE_PERIOD_LOCKED',
        'Attendance cannot change after the related payroll period is calculated.',
        409,
      );
  }

  private async apply(
    tx: Prisma.TransactionClient,
    adjustment: {
      id: string;
      companyId: string;
      employeeId: string;
      attendanceSessionId: string | null;
      date: Date;
      requestedClockIn: Date | null;
      requestedClockOut: Date | null;
    },
  ) {
    const employee = await tx.employee.findUnique({
      where: {
        companyId_id: {
          companyId: adjustment.companyId,
          id: adjustment.employeeId,
        },
      },
      select: { scheduleId: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    const existing = adjustment.attendanceSessionId
      ? await tx.attendanceSession.findUnique({
          where: {
            companyId_id: {
              companyId: adjustment.companyId,
              id: adjustment.attendanceSessionId,
            },
          },
        })
      : await tx.attendanceSession.findFirst({
          where: {
            companyId: adjustment.companyId,
            employeeId: adjustment.employeeId,
            date: adjustment.date,
          },
          orderBy: { clockIn: 'asc' },
        });
    const clockIn = adjustment.requestedClockIn ?? existing?.clockIn;
    const clockOut = adjustment.requestedClockOut ?? existing?.clockOut;
    if (!clockIn)
      fail(
        'ATTENDANCE_TIME_REQUIRED',
        'An approved adjustment needs a clock-in time.',
        422,
      );
    if (clockOut && clockOut <= clockIn)
      fail(
        'INVALID_ATTENDANCE_TIME',
        'Requested clock-out must be later than clock-in.',
        422,
      );
    const durationMinutes = clockOut
      ? Math.max(
          0,
          Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000),
        )
      : null;
    const schedule = employee.scheduleId
      ? await tx.workSchedule.findFirst({
          where: {
            companyId: adjustment.companyId,
            id: employee.scheduleId,
            active: true,
          },
          select: {
            breakMinutes: true,
            startMinute: true,
            endMinute: true,
          },
        })
      : null;
    const hoursWorkedMinutes =
      durationMinutes === null
        ? null
        : Math.max(0, durationMinutes - (schedule?.breakMinutes ?? 0));
    const scheduledMinutes = schedule
      ? Math.max(
          0,
          ((schedule.endMinute - schedule.startMinute + 1440) % 1440 || 1440) -
            schedule.breakMinutes,
        )
      : 0;
    const overtimeMinutes =
      hoursWorkedMinutes === null
        ? 0
        : Math.max(0, hoursWorkedMinutes - scheduledMinutes);
    const values = {
      date: adjustment.date,
      clockIn,
      clockOut: clockOut ?? null,
      durationMinutes,
      hoursWorkedMinutes,
      overtimeMinutes,
    };
    const session = existing
      ? await tx.attendanceSession.update({
          where: { id: existing.id },
          data: values,
        })
      : await tx.attendanceSession.create({
          data: {
            companyId: adjustment.companyId,
            employeeId: adjustment.employeeId,
            ...values,
            clockInKey: `ADJUSTMENT:${adjustment.id}:IN`,
            clockOutKey: clockOut ? `ADJUSTMENT:${adjustment.id}:OUT` : null,
          },
        });
    if (!adjustment.attendanceSessionId)
      await tx.attendanceAdjustment.update({
        where: { id: adjustment.id },
        data: { attendanceSessionId: session.id },
      });
    return session;
  }

  async create(m: Membership, dto: AttendanceAdjustmentDto) {
    const { clockIn, clockOut } = this.validateTimes(dto);
    const date = dateOnly(dto.date);
    return this.db.$transaction(async (tx) => {
      const replay = await tx.attendanceAdjustment.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId: m.companyId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      if (replay) return { data: replay, idempotent: true };
      const employee = await selfEmployee(tx, m);
      await this.assertUnlocked(tx, m.companyId, date);
      if (
        dto.attendanceSessionId &&
        !(await tx.attendanceSession.findFirst({
          where: {
            companyId: m.companyId,
            id: dto.attendanceSessionId,
            employeeId: employee.id,
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Attendance session not found.');
      const status = employee.managerId
        ? RequestStatus.PENDING_MANAGER
        : RequestStatus.PENDING_HR;
      const adjustment = await tx.attendanceAdjustment.create({
        data: {
          companyId: m.companyId,
          employeeId: employee.id,
          attendanceSessionId: dto.attendanceSessionId,
          idempotencyKey: dto.idempotencyKey,
          date,
          requestedClockIn: clockIn,
          requestedClockOut: clockOut,
          reason: dto.reason.trim(),
          status,
        },
      });
      await tx.attendanceAdjustmentEvent.create({
        data: {
          companyId: m.companyId,
          adjustmentId: adjustment.id,
          actorId: m.userId,
          fromStatus: null,
          toStatus: status,
          comment: dto.reason.trim(),
        },
      });
      await audit(tx, m, 'ATTENDANCE_ADJUSTMENT_CREATED', adjustment.id, {
        date: dto.date,
        status,
      });
      return { data: adjustment, idempotent: false };
    }, serializable);
  }

  async list(
    m: Membership,
    q: AttendanceAdjustmentQueryDto,
    own = false,
    pending = false,
  ) {
    if (own && !m.employeeId)
      throw new NotFoundException('No employee linked.');
    const where: Prisma.AttendanceAdjustmentWhereInput = {
      companyId: m.companyId,
      ...(own ? { employeeId: m.employeeId! } : {}),
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
      ...(pending
        ? {
            status: {
              in: [RequestStatus.PENDING_MANAGER, RequestStatus.PENDING_HR],
            },
          }
        : q.status
          ? { status: q.status }
          : {}),
      ...(q.from || q.to
        ? {
            date: {
              ...(q.from ? { gte: dateOnly(q.from) } : {}),
              ...(q.to ? { lte: dateOnly(q.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.attendanceAdjustment.findMany({
        where,
        include: {
          employee: {
            select: { id: true, employeeNo: true, name: true, managerId: true },
          },
          events: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.attendanceAdjustment.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async pending(m: Membership, q: AttendanceAdjustmentQueryDto) {
    return this.list(m, q, false, true);
  }

  async detail(m: Membership, id: string) {
    const row = await this.db.attendanceAdjustment.findFirst({
      where: { companyId: m.companyId, id },
      include: {
        employee: {
          select: { id: true, employeeNo: true, name: true, managerId: true },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException('Attendance adjustment not found.');
    if (
      !privileged(m, ['OWNER', 'HR']) &&
      m.employeeId !== row.employeeId &&
      m.employeeId !== row.employee.managerId
    )
      throw new ForbiddenException();
    return { data: row };
  }

  async decide(
    m: Membership,
    id: string,
    d: { decision: 'APPROVE' | 'REJECT'; comment?: string },
  ) {
    decisionComment(d);
    return this.db.$transaction(async (tx) => {
      const row = await tx.attendanceAdjustment.findFirst({
        where: { companyId: m.companyId, id },
        include: { employee: { select: { id: true, managerId: true } } },
      });
      if (!row) throw new NotFoundException('Attendance adjustment not found.');
      const admin = privileged(m, ['OWNER', 'HR']);
      const manager =
        m.employeeId !== null && m.employeeId === row.employee.managerId;
      if (row.status === RequestStatus.PENDING_MANAGER) {
        if (!manager && !admin) throw new ForbiddenException();
        if (admin && !manager && d.decision === 'APPROVE' && !d.comment?.trim())
          fail(
            'COMMENT_REQUIRED',
            'HR direct correction requires a reason.',
            400,
          );
      } else if (row.status === RequestStatus.PENDING_HR) {
        if (!admin) throw new ForbiddenException();
      } else {
        fail(
          'INVALID_ATTENDANCE_ADJUSTMENT_STATE',
          'Only pending attendance adjustments can be decided.',
          409,
        );
      }
      await this.assertUnlocked(tx, m.companyId, row.date);
      const next =
        d.decision === 'REJECT'
          ? RequestStatus.REJECTED
          : row.status === RequestStatus.PENDING_MANAGER && manager
            ? RequestStatus.PENDING_HR
            : RequestStatus.APPROVED;
      if (next === RequestStatus.APPROVED) await this.apply(tx, row);
      const updated = await tx.attendanceAdjustment.update({
        where: { id: row.id },
        data: { status: next },
      });
      await tx.attendanceAdjustmentEvent.create({
        data: {
          companyId: m.companyId,
          adjustmentId: row.id,
          actorId: m.userId,
          fromStatus: row.status,
          toStatus: next,
          comment: d.comment?.trim() || null,
        },
      });
      await audit(tx, m, 'ATTENDANCE_ADJUSTMENT_DECIDED', row.id, {
        fromStatus: row.status,
        toStatus: next,
        comment: d.comment?.trim() || null,
      });
      return { data: updated };
    }, serializable);
  }

  async correct(m: Membership, dto: AttendanceCorrectionDto) {
    const { clockIn, clockOut } = this.validateTimes(dto);
    const date = dateOnly(dto.date);
    return this.db.$transaction(async (tx) => {
      const replay = await tx.attendanceAdjustment.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId: m.companyId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (replay) return { data: replay, idempotent: true };
      const employee = await tx.employee.findFirst({
        where: { companyId: m.companyId, id: dto.employeeId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Employee not found.');
      if (
        dto.attendanceSessionId &&
        !(await tx.attendanceSession.findFirst({
          where: {
            companyId: m.companyId,
            id: dto.attendanceSessionId,
            employeeId: dto.employeeId,
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Attendance session not found.');
      await this.assertUnlocked(tx, m.companyId, date);
      const adjustment = await tx.attendanceAdjustment.create({
        data: {
          companyId: m.companyId,
          employeeId: dto.employeeId,
          attendanceSessionId: dto.attendanceSessionId,
          idempotencyKey: dto.idempotencyKey,
          date,
          requestedClockIn: clockIn,
          requestedClockOut: clockOut,
          reason: dto.reason.trim(),
          status: RequestStatus.APPROVED,
        },
      });
      await this.apply(tx, adjustment);
      const updated = await tx.attendanceAdjustment.findUniqueOrThrow({
        where: { id: adjustment.id },
      });
      await tx.attendanceAdjustmentEvent.create({
        data: {
          companyId: m.companyId,
          adjustmentId: adjustment.id,
          actorId: m.userId,
          fromStatus: null,
          toStatus: RequestStatus.APPROVED,
          comment: dto.reason.trim(),
        },
      });
      await audit(tx, m, 'ATTENDANCE_DIRECT_CORRECTION', adjustment.id, {
        employeeId: dto.employeeId,
        date: dto.date,
        reason: dto.reason.trim(),
      });
      return { data: updated, idempotent: false };
    }, serializable);
  }
}
