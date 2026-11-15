import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Membership, Prisma, RequestStatus } from '@prisma/client';
import { Database } from '../database.module';
import { paginated } from '../common/page.dto';
import {
  audit,
  dateOnly,
  dateString,
  DecisionDto,
  decisionComment,
  fail,
  privileged,
  selfEmployee,
} from '../common/domain';
import {
  OvertimeDto,
  OvertimeQueryDto,
  OVERTIME_TYPES,
  UpdateOvertimeDto,
} from './overtime.dto';

type OvertimeInput = {
  employeeId?: string;
  departmentId?: string;
  requestDate?: string;
  overtimeDate?: string;
  overtimeType?: (typeof OVERTIME_TYPES)[number];
  startTime?: string;
  endTime?: string;
  breakDurationMinutes?: number;
  description?: string;
};

const decimal = (value: Prisma.Decimal | null | undefined, places = 2) =>
  value === null || value === undefined ? null : value.toFixed(places);

function scanAccepted(status: string) {
  return (
    status === 'CLEAN' ||
    (status === 'UNSCANNED' &&
      process.env.NODE_ENV !== 'production' &&
      process.env.ALLOW_UNSCANNED_UPLOADS === 'true')
  );
}

@Injectable()
export class OvertimeService {
  constructor(private db: Database) {}

  private async resolveEmployee(
    tx: Prisma.TransactionClient,
    m: Membership,
    employeeId?: string,
  ) {
    const id = employeeId ?? (await selfEmployee(tx, m)).id;
    if (id !== m.employeeId && !privileged(m, ['OWNER', 'HR']))
      throw new ForbiddenException();
    const employee = await tx.employee.findFirst({
      where: { companyId: m.companyId, id, active: true },
      include: { department: true },
    });
    if (!employee) throw new NotFoundException('Active employee not found.');
    return employee;
  }

  private async values(
    tx: Prisma.TransactionClient,
    m: Membership,
    input: OvertimeInput,
    current?: {
      employeeId: string;
      departmentId: string | null;
      requestDate: Date;
      overtimeDate: Date;
      overtimeType: string;
      startTime: string;
      endTime: string;
      breakDurationMinutes: number;
      description: string;
    },
  ) {
    const employee = await this.resolveEmployee(
      tx,
      m,
      input.employeeId ?? current?.employeeId,
    );
    const departmentId =
      input.departmentId ?? current?.departmentId ?? employee.departmentId;
    if (departmentId && departmentId !== employee.departmentId)
      fail(
        'DEPARTMENT_MISMATCH',
        'The selected department does not match the employee.',
        400,
      );

    const requestDate = input.requestDate
      ? dateOnly(input.requestDate)
      : current?.requestDate;
    const overtimeDate = input.overtimeDate
      ? dateOnly(input.overtimeDate)
      : current?.overtimeDate;
    const overtimeType = input.overtimeType ?? current?.overtimeType;
    const startTime = input.startTime ?? current?.startTime;
    const endTime = input.endTime ?? current?.endTime;
    const breakDurationMinutes =
      input.breakDurationMinutes ?? current?.breakDurationMinutes;
    const description = input.description ?? current?.description;
    if (
      !requestDate ||
      !overtimeDate ||
      !overtimeType ||
      !startTime ||
      !endTime
    )
      fail('INVALID_OVERTIME', 'Complete all overtime details.', 400);
    if (breakDurationMinutes === undefined || breakDurationMinutes < 0)
      fail('INVALID_BREAK', 'Break duration cannot be negative.', 400);
    if (!description?.trim())
      fail('DESCRIPTION_REQUIRED', 'Describe the overtime work.', 400);
    if (overtimeDate < employee.joinedDate)
      fail('OVERTIME_BEFORE_EMPLOYMENT', 'Overtime date precedes employment.');

    const minute = (value: string) => {
      const match = /^(\d{2}):(\d{2})$/.exec(value);
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
        fail('INVALID_TIME', 'Use a valid 24-hour time.', 400);
      return Number(match[1]) * 60 + Number(match[2]);
    };
    const startMinute = minute(startTime);
    const endMinute = minute(endTime);
    const totalMinutes = (endMinute - startMinute + 1440) % 1440;
    if (!totalMinutes)
      fail('INVALID_DURATION', 'Overtime must have a positive duration.', 400);
    if (breakDurationMinutes >= totalMinutes)
      fail(
        'INVALID_BREAK',
        'Break duration must be shorter than overtime.',
        400,
      );

    const settings = await tx.payrollSettings.findUnique({
      where: { companyId: m.companyId },
    });
    const defaults = {
      NORMAL_WORKING_DAY: {
        multiplier: new Prisma.Decimal('1.5'),
        earningCode: 'OT',
      },
      REST_DAY: {
        multiplier: new Prisma.Decimal('2.0'),
        earningCode: 'OT-REST',
      },
      PUBLIC_HOLIDAY: {
        multiplier: new Prisma.Decimal('3.0'),
        earningCode: 'OT-PH',
      },
    } as const;
    const configured = {
      NORMAL_WORKING_DAY: {
        multiplier:
          settings?.normalWorkingDayMultiplier ??
          defaults.NORMAL_WORKING_DAY.multiplier,
        earningCode:
          settings?.normalWorkingDayEarningCode ??
          defaults.NORMAL_WORKING_DAY.earningCode,
      },
      REST_DAY: {
        multiplier:
          settings?.restDayOvertimeMultiplier ?? defaults.REST_DAY.multiplier,
        earningCode:
          settings?.restDayEarningCode ?? defaults.REST_DAY.earningCode,
      },
      PUBLIC_HOLIDAY: {
        multiplier:
          settings?.publicHolidayOvertimeMultiplier ??
          defaults.PUBLIC_HOLIDAY.multiplier,
        earningCode:
          settings?.publicHolidayEarningCode ??
          defaults.PUBLIC_HOLIDAY.earningCode,
      },
    };
    const selected = configured[overtimeType as keyof typeof configured];
    if (!selected || selected.multiplier.lte(0))
      fail(
        'OVERTIME_RATE_NOT_CONFIGURED',
        'Configure a positive overtime rate.',
      );

    return {
      employeeId: employee.id,
      departmentId: departmentId ?? null,
      requestDate,
      overtimeDate,
      overtimeType,
      startTime,
      endTime,
      totalMinutes,
      breakDurationMinutes,
      netMinutes: totalMinutes - breakDurationMinutes,
      hourlyRateMultiplier: selected.multiplier,
      earningCode: selected.earningCode,
      description: description.trim(),
    };
  }

  private serialize(row: any) {
    return {
      ...row,
      requestDate: dateString(row.requestDate),
      overtimeDate: dateString(row.overtimeDate),
      hourlyRateMultiplier: decimal(row.hourlyRateMultiplier),
      employeeName: row.employee?.name ?? null,
      departmentName: row.department?.name ?? null,
      supportingDocuments:
        row.files?.map((file: any) => file.originalName) ?? [],
      approval: {
        approver: row.decidedBy ?? '-',
        approvedDate: row.decidedAt ? dateString(row.decidedAt) : null,
        comments: row.decisionComment ?? '',
      },
    };
  }

  private include = {
    employee: {
      select: { id: true, employeeNo: true, name: true, managerId: true },
    },
    department: { select: { id: true, code: true, name: true } },
    files: {
      where: { archived: false },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        scanStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' as const },
    },
  };

  async create(m: Membership, d: OvertimeDto) {
    return this.db.$transaction(
      async (tx) => {
        const values = await this.values(tx, m, d);
        const data = await tx.overtimeRequest.create({
          data: { ...values, companyId: m.companyId },
          include: this.include,
        });
        await audit(tx, m, 'OVERTIME_DRAFT_CREATED', data.id);
        return { data: this.serialize(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async edit(m: Membership, id: string, d: UpdateOvertimeDto) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.overtimeRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (row.status !== 'DRAFT')
          fail(
            'INVALID_STATE',
            'Only draft overtime requests can be edited.',
            409,
          );
        const values = await this.values(tx, m, d, row);
        const data = await tx.overtimeRequest.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: values,
          include: this.include,
        });
        await audit(tx, m, 'OVERTIME_DRAFT_UPDATED', id);
        return { data: this.serialize(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async detail(m: Membership, id: string) {
    const data = await this.db.overtimeRequest.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
      include: this.include,
    });
    if (!data) throw new NotFoundException();
    const visible =
      m.employeeId === data.employeeId ||
      privileged(m, ['OWNER', 'HR', 'FINANCE']) ||
      (!!m.employeeId && m.employeeId === data.employee.managerId);
    if (!visible) throw new NotFoundException();
    return { data: this.serialize(data) };
  }

  async list(
    m: Membership,
    q: OvertimeQueryDto,
    mode: 'own' | 'all' | 'pending',
  ) {
    if (mode === 'own') {
      const employee = await selfEmployee(this.db, m);
      q.employeeId = employee.id;
    }
    if (mode === 'all' && !privileged(m, ['OWNER', 'HR', 'FINANCE']))
      return paginated([], 0, q);
    if (q.from && q.to && q.to < q.from)
      fail('INVALID_RANGE', 'End date precedes start date.', 400);

    let where: Prisma.OvertimeRequestWhereInput = { companyId: m.companyId };
    if (q.employeeId) where.employeeId = q.employeeId;
    if (mode === 'pending') {
      where = {
        ...where,
        status: 'PENDING_MANAGER',
        ...(privileged(m, ['OWNER', 'HR'])
          ? {}
          : m.employeeId
            ? { employee: { managerId: m.employeeId } }
            : { id: '__none__' }),
      };
    }
    where = {
      AND: [
        where,
        {
          status: q.status,
          departmentId: q.departmentId,
          overtimeType: q.overtimeType,
          ...(q.search
            ? {
                OR: [
                  { description: { contains: q.search, mode: 'insensitive' } },
                  { earningCode: { contains: q.search, mode: 'insensitive' } },
                  {
                    employee: {
                      name: { contains: q.search, mode: 'insensitive' },
                    },
                  },
                  {
                    employee: {
                      employeeNo: { contains: q.search, mode: 'insensitive' },
                    },
                  },
                ],
              }
            : {}),
          ...(q.from || q.to
            ? {
                overtimeDate: {
                  ...(q.from ? { gte: dateOnly(q.from) } : {}),
                  ...(q.to ? { lte: dateOnly(q.to) } : {}),
                },
              }
            : {}),
        },
      ],
    };
    const [rows, total] = await this.db.$transaction([
      this.db.overtimeRequest.findMany({
        where,
        include: this.include,
        orderBy: [{ overtimeDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.overtimeRequest.count({ where }),
    ]);
    return paginated(
      rows.map((row) => this.serialize(row)),
      total,
      q,
    );
  }

  async submit(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.overtimeRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
          include: { employee: true },
        });
        if (!row) throw new NotFoundException();
        if (row.employeeId !== m.employeeId && !privileged(m, ['OWNER', 'HR']))
          throw new ForbiddenException();
        if (row.status !== 'DRAFT')
          fail(
            'INVALID_STATE',
            'Only draft overtime requests can be submitted.',
            409,
          );
        if (!row.employee.managerId)
          fail(
            'MANAGER_REQUIRED',
            'Assign a reporting manager before submitting.',
          );
        const manager = await tx.employee.findFirst({
          where: {
            companyId: m.companyId,
            id: row.employee.managerId,
            active: true,
          },
        });
        if (!manager)
          fail(
            'MANAGER_REQUIRED',
            'Assign an active reporting manager before submitting.',
          );
        const files = await tx.storedFile.findMany({
          where: {
            companyId: m.companyId,
            employeeId: row.employeeId,
            overtimeRequestId: id,
            category: 'OVERTIME_DOCUMENT',
            archived: false,
          },
        });
        if (!files.length)
          fail(
            'OVERTIME_DOCUMENT_REQUIRED',
            'Attach a supporting document before submission.',
          );
        if (files.some((file) => !scanAccepted(file.scanStatus)))
          fail(
            'FILE_QUARANTINED',
            'All supporting documents must pass scanning before submission.',
            409,
          );
        const data = await tx.overtimeRequest.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { status: 'PENDING_MANAGER', submittedAt: new Date() },
          include: this.include,
        });
        await audit(tx, m, 'OVERTIME_SUBMITTED', id);
        return { data: this.serialize(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async decide(m: Membership, id: string, d: DecisionDto) {
    decisionComment(d);
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.overtimeRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
          include: { employee: true },
        });
        if (!row) throw new NotFoundException();
        if (row.status !== 'PENDING_MANAGER')
          fail('INVALID_STATE', 'Overtime is not awaiting a decision.', 409);
        if (row.employeeId === m.employeeId)
          throw new ForbiddenException('You cannot approve your own overtime.');
        const allowed =
          privileged(m, ['OWNER', 'HR']) ||
          (!!m.employeeId && m.employeeId === row.employee.managerId);
        if (!allowed) throw new ForbiddenException();
        const status: RequestStatus =
          d.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const data = await tx.overtimeRequest.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: {
            status,
            decisionComment: d.comment?.trim() || null,
            decidedBy: m.userId,
            decidedAt: new Date(),
          },
          include: this.include,
        });
        await audit(tx, m, `OVERTIME_${d.decision}`, id);
        return { data: this.serialize(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async cancel(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.overtimeRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (row.employeeId !== m.employeeId && !privileged(m, ['OWNER', 'HR']))
          throw new ForbiddenException();
        if (!['DRAFT', 'PENDING_MANAGER'].includes(row.status))
          fail(
            'INVALID_STATE',
            'Only unapproved overtime can be cancelled.',
            409,
          );
        const data = await tx.overtimeRequest.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { status: 'CANCELLED' },
          include: this.include,
        });
        await audit(tx, m, 'OVERTIME_CANCELLED', id);
        return { data: this.serialize(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
