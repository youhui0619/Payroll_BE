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
  dateString,
  decisionComment,
  DecisionDto,
  fail,
  localDate,
  mayRead,
  privileged,
  selfEmployee,
} from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import {
  GrantDto,
  LeaveDto,
  LeavePolicyDto,
  LeaveBalanceQueryDto,
} from './leave.dto';
const pending: RequestStatus[] = ['PENDING_MANAGER', 'PENDING_HR'];
export function workingDates(
  start: Date,
  end: Date,
  days: number[],
  holidays: { startDate: Date; endDate: Date }[],
) {
  const result: string[] = [];
  for (let at = start.getTime(); at <= end.getTime(); at += 86400000) {
    const d = new Date(at);
    if (
      days.includes(d.getUTCDay()) &&
      !holidays.some((h) => h.startDate <= d && h.endDate >= d)
    )
      result.push(dateString(d));
  }
  return result;
}
export function workingDays(
  start: Date,
  end: Date,
  days: number[],
  holidays: { startDate: Date; endDate: Date }[],
) {
  return workingDates(start, end, days, holidays).length;
}
@Injectable()
export class LeaveService {
  constructor(private db: Database) {}
  private async unlocked(
    tx: Prisma.TransactionClient,
    row: { companyId: string; startDate: Date; endDate: Date },
  ) {
    const locked = await tx.payrollRun.count({
      where: {
        companyId: row.companyId,
        status: { not: 'DRAFT' },
        AND: [
          {
            OR: [
              { year: { gt: row.startDate.getUTCFullYear() } },
              {
                year: row.startDate.getUTCFullYear(),
                month: { gte: row.startDate.getUTCMonth() + 1 },
              },
            ],
          },
          {
            OR: [
              { year: { lt: row.endDate.getUTCFullYear() } },
              {
                year: row.endDate.getUTCFullYear(),
                month: { lte: row.endDate.getUTCMonth() + 1 },
              },
            ],
          },
        ],
      },
    });
    if (locked)
      fail(
        'PAYROLL_PERIOD_LOCKED',
        'Leave cannot change a calculated or finalized payroll month.',
        409,
      );
  }
  private async event(
    tx: Prisma.TransactionClient,
    m: Membership,
    id: string,
    action: string,
    status: RequestStatus,
    comment?: string,
  ) {
    await tx.leaveEvent.create({
      data: {
        companyId: m.companyId,
        requestId: id,
        actorId: m.userId,
        action,
        status,
        comment,
      },
    });
    await audit(tx, m, action, id);
  }
  async detail(m: Membership, id: string) {
    const data = await this.db.leaveRequest.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
      include: { events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (
      !data ||
      !(
        data.employeeId === m.employeeId ||
        privileged(m, ['OWNER', 'HR']) ||
        (!!m.employeeId && data.managerId === m.employeeId)
      )
    )
      throw new NotFoundException();
    return { data };
  }
  async edit(m: Membership, id: string, d: LeaveDto) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.leaveRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (row.employeeId !== (await selfEmployee(tx, m)).id)
          throw new ForbiddenException();
        if (row.status !== 'DRAFT')
          fail('INVALID_STATE', 'Only draft leave can be edited.', 409);
        const { employee, policy, start, end, days } = await this.eligibility(
          tx,
          m,
          d,
        );
        const data = await tx.leaveRequest.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: {
            policyId: policy.id,
            startDate: start,
            endDate: end,
            halfDay: d.halfDay,
            days: d.halfDay ? '0.50' : String(days),
            reason: d.reason,
            managerId: employee.managerId,
            approval: policy.approval,
            paid: policy.paid,
          },
        });
        await this.event(tx, m, id, 'LEAVE_DRAFT_UPDATED', 'DRAFT');
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async policies(m: Membership, q: PageDto) {
    const where = { companyId: m.companyId };
    const [data, total] = await this.db.$transaction([
      this.db.leavePolicy.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.leavePolicy.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async createPolicy(m: Membership, d: LeavePolicyDto) {
    if (d.effectiveTo && d.effectiveTo < d.effectiveFrom)
      fail('INVALID_DATES', 'Policy end precedes start.');
    return this.db.$transaction(async (tx) => {
      const data = await tx.leavePolicy.create({
        data: {
          ...d,
          companyId: m.companyId,
          effectiveFrom: dateOnly(d.effectiveFrom),
          effectiveTo: d.effectiveTo ? dateOnly(d.effectiveTo) : null,
        },
      });
      await audit(tx, m, 'LEAVE_POLICY_CREATED', data.id);
      return { data };
    });
  }
  async grant(m: Membership, d: GrantDto) {
    return this.db.$transaction(
      async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: d.employeeId } },
        });
        const policy = await tx.leavePolicy.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: d.policyId } },
        });
        if (!employee || !policy) throw new NotFoundException();
        const key = 'grant:' + d.idempotencyKey;
        const old = await tx.leaveLedger.findUnique({
          where: {
            companyId_idempotencyKey: {
              companyId: m.companyId,
              idempotencyKey: key,
            },
          },
        });
        if (old) {
          if (
            old.employeeId !== d.employeeId ||
            old.policyId !== d.policyId ||
            old.year !== d.year ||
            !old.days.equals(d.days)
          )
            fail(
              'IDEMPOTENCY_CONFLICT',
              'Key was used for another grant.',
              409,
            );
          return { data: old };
        }
        if (!d.reason.trim() || new Prisma.Decimal(d.days).isZero())
          fail(
            'INVALID_ADJUSTMENT',
            'Provide a reason and a non-zero adjustment.',
            400,
          );
        if (new Prisma.Decimal(d.days).isNegative())
          await this.available(tx, {
            companyId: m.companyId,
            employeeId: d.employeeId,
            policyId: d.policyId,
            startDate: new Date(Date.UTC(d.year, 0, 1)),
            id: '00000000-0000-0000-0000-000000000000',
            days: new Prisma.Decimal(d.days).negated(),
          });
        const data = await tx.leaveLedger.create({
          data: {
            companyId: m.companyId,
            employeeId: d.employeeId,
            policyId: d.policyId,
            year: d.year,
            days: d.days,
            kind: 'ADJUSTMENT',
            reason: d.reason,
            idempotencyKey: key,
          },
        });
        await audit(tx, m, 'LEAVE_BALANCE_ADJUSTED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async balance(
    m: Membership,
    q: LeaveBalanceQueryDto = {},
    employeeId?: string,
  ) {
    if (employeeId) mayRead(m, employeeId);
    return this.db.$transaction(
      async (tx) => {
        const e = employeeId
          ? await tx.employee.findUnique({
              where: {
                companyId_id: { companyId: m.companyId, id: employeeId },
              },
            })
          : await selfEmployee(tx, m);
        if (!e) throw new NotFoundException();
        const company = await tx.company.findUniqueOrThrow({
          where: { id: m.companyId },
        });
        const year =
          q.year ?? Number(localDate(new Date(), company.timezone).slice(0, 4));
        const start = new Date(Date.UTC(year, 0, 1)),
          next = new Date(Date.UTC(year + 1, 0, 1));
        const policies = await tx.leavePolicy.findMany({
          where: {
            companyId: m.companyId,
            OR: [
              {
                active: true,
                effectiveFrom: { lt: next },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
              },
              { ledger: { some: { employeeId: e.id, year } } },
              {
                requests: {
                  some: {
                    employeeId: e.id,
                    startDate: { gte: start, lt: next },
                    status: { in: pending },
                  },
                },
              },
            ],
          },
          orderBy: { code: 'asc' },
          take: 1001,
        });
        if (policies.length > 1000)
          fail(
            'TOO_MANY_POLICIES',
            'Balance view supports up to 1000 policies.',
          );
        const totals = await tx.leaveLedger.groupBy({
          by: ['policyId'],
          where: { companyId: m.companyId, employeeId: e.id, year },
          _sum: { days: true },
        });
        const reservations = await tx.leaveRequest.groupBy({
          by: ['policyId'],
          where: {
            companyId: m.companyId,
            employeeId: e.id,
            paid: true,
            status: { in: pending },
            startDate: { gte: start, lt: next },
          },
          _sum: { days: true },
        });
        const balances = new Map(
          totals.map((row) => [
            row.policyId,
            new Prisma.Decimal(row._sum.days ?? 0),
          ]),
        );
        const reserved = new Map(
          reservations.map((row) => [
            row.policyId,
            new Prisma.Decimal(row._sum.days ?? 0),
          ]),
        );
        return {
          data: policies.map((policy) => {
            const balance = balances.get(policy.id) ?? new Prisma.Decimal(0),
              held = reserved.get(policy.id) ?? new Prisma.Decimal(0);
            return {
              policyId: policy.id,
              code: policy.code,
              name: policy.name,
              year,
              paid: policy.paid,
              active: policy.active,
              balance: balance.toFixed(2),
              reserved: held.toFixed(2),
              available: policy.paid ? balance.minus(held).toFixed(2) : null,
            };
          }),
          meta: { year, employeeId: e.id },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async eligibility(tx: Prisma.TransactionClient, m: Membership, d: LeaveDto) {
    if (!d.reason.trim())
      fail('REASON_REQUIRED', 'Provide a reason for leave.', 400);
    const employee = await selfEmployee(tx, m);
    const policy = await tx.leavePolicy.findFirst({
      where: { id: d.policyId, companyId: m.companyId, active: true },
    });
    if (!policy) throw new NotFoundException('Leave policy not found.');
    const start = dateOnly(d.startDate),
      end = dateOnly(d.endDate);
    if (end < start || start.getUTCFullYear() !== end.getUTCFullYear())
      fail('INVALID_DATES', 'Use ordered dates within one calendar year.');
    if (
      start < employee.joinedDate ||
      start < policy.effectiveFrom ||
      (policy.effectiveTo && end > policy.effectiveTo)
    )
      fail(
        'LEAVE_INELIGIBLE',
        'Dates are outside employment or policy eligibility.',
      );
    const company = await tx.company.findUniqueOrThrow({
      where: { id: m.companyId },
    });
    const today = dateOnly(localDate(new Date(), company.timezone));
    if (start.getTime() < today.getTime() + policy.noticeDays * 86400000)
      fail('LEAVE_NOTICE_REQUIRED', 'Minimum advance notice has not been met.');
    if (!employee.scheduleId)
      fail(
        'SCHEDULE_REQUIRED',
        'Assign a work schedule before applying for leave.',
      );
    const schedule = await tx.workSchedule.findFirst({
      where: { id: employee.scheduleId, companyId: m.companyId, active: true },
    });
    if (
      !schedule ||
      start < schedule.effectiveFrom ||
      (schedule.effectiveTo && end > schedule.effectiveTo)
    )
      fail('SCHEDULE_REQUIRED', 'No schedule covers these dates.');
    const location = employee.locationId
      ? await tx.workLocation.findFirst({
          where: { id: employee.locationId, companyId: m.companyId },
        })
      : null;
    const holidays = await tx.publicHoliday.findMany({
      where: {
        companyId: m.companyId,
        active: true,
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    const dates = workingDates(
      start,
      end,
      schedule.workingDays,
      holidays.filter(
        (h) =>
          !h.states.length || (location && h.states.includes(location.state)),
      ),
    );
    const days = dates.length;
    if (!days)
      fail('NO_WORKING_DAYS', 'The selected range has no working days.');
    if (
      d.halfDay &&
      (!policy.allowHalfDay || d.startDate !== d.endDate || days !== 1)
    )
      fail(
        'HALF_DAY_NOT_ALLOWED',
        'Half day requires one working date and a policy that allows it.',
      );
    if (
      ['MANAGER', 'MANAGER_HR'].includes(policy.approval) &&
      (!employee.managerId ||
        !(await tx.employee.findFirst({
          where: {
            companyId: m.companyId,
            id: employee.managerId,
            active: true,
          },
        })))
    )
      fail('MANAGER_REQUIRED', 'Assign a reporting manager first.');
    return {
      employee,
      policy,
      start,
      end,
      days,
      daySnapshot: {
        version: 1,
        scheduleId: schedule.id,
        workingDays: [...schedule.workingDays],
        locationId: employee.locationId,
        state: location?.state ?? null,
        dates: dates.map((date) => ({ date, days: d.halfDay ? '0.5' : '1' })),
      },
    };
  }
  async create(m: Membership, d: LeaveDto) {
    return this.db.$transaction(
      async (tx) => {
        const { employee, policy, start, end, days } = await this.eligibility(
          tx,
          m,
          d,
        );
        const data = await tx.leaveRequest.create({
          data: {
            companyId: m.companyId,
            employeeId: employee.id,
            policyId: policy.id,
            startDate: start,
            endDate: end,
            halfDay: d.halfDay,
            days: d.halfDay ? '0.50' : String(days),
            reason: d.reason,
            managerId: employee.managerId,
            approval: policy.approval,
            paid: policy.paid,
          },
        });
        await this.event(tx, m, data.id, 'LEAVE_DRAFT_CREATED', 'DRAFT');
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async list(m: Membership, q: PageDto, all = false) {
    const employeeId = all ? undefined : (await selfEmployee(this.db, m)).id;
    const where = { companyId: m.companyId, employeeId };
    const [data, total] = await this.db.$transaction([
      this.db.leaveRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.leaveRequest.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async available(
    tx: Prisma.TransactionClient,
    row: {
      companyId: string;
      employeeId: string;
      policyId: string;
      startDate: Date;
      id: string;
      days: Prisma.Decimal;
    },
  ) {
    const year = row.startDate.getUTCFullYear();
    const sum = await tx.leaveLedger.aggregate({
      where: {
        companyId: row.companyId,
        employeeId: row.employeeId,
        policyId: row.policyId,
        year,
      },
      _sum: { days: true },
    });
    const reserved = await tx.leaveRequest.aggregate({
      where: {
        companyId: row.companyId,
        employeeId: row.employeeId,
        policyId: row.policyId,
        status: { in: pending },
        id: { not: row.id },
        startDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      _sum: { days: true },
    });
    if (
      new Prisma.Decimal(sum._sum.days ?? 0)
        .minus(reserved._sum.days ?? 0)
        .lessThan(row.days)
    )
      fail(
        'LEAVE_BALANCE_INSUFFICIENT',
        'Insufficient available leave balance.',
      );
  }
  async consume(
    tx: Prisma.TransactionClient,
    row: {
      id: string;
      companyId: string;
      employeeId: string;
      policyId: string;
      startDate: Date;
      days: Prisma.Decimal;
    },
    reverse = false,
  ) {
    await tx.leaveLedger.create({
      data: {
        companyId: row.companyId,
        employeeId: row.employeeId,
        policyId: row.policyId,
        requestId: row.id,
        year: row.startDate.getUTCFullYear(),
        days: reverse ? row.days : row.days.negated(),
        kind: reverse ? 'REVERSAL' : 'USAGE',
        reason: reverse ? 'Approved leave cancelled' : 'Leave approved',
        idempotencyKey: (reverse ? 'reverse:' : 'usage:') + row.id,
      },
    });
  }
  async submit(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        let row = await tx.leaveRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (row.employeeId !== (await selfEmployee(tx, m)).id)
          throw new ForbiddenException();
        if (row.status !== 'DRAFT')
          fail('INVALID_STATE', 'Only drafts can be submitted.', 409);
        await this.unlocked(tx, row);
        const current = await this.eligibility(tx, m, {
          policyId: row.policyId,
          startDate: dateString(row.startDate),
          endDate: dateString(row.endDate),
          halfDay: row.halfDay,
          reason: row.reason,
        });
        row = {
          ...row,
          days: new Prisma.Decimal(row.halfDay ? '0.50' : String(current.days)),
          managerId: current.employee.managerId,
          approval: current.policy.approval,
          paid: current.policy.paid,
        };
        const overlap = await tx.leaveRequest.findFirst({
          where: {
            companyId: m.companyId,
            employeeId: row.employeeId,
            id: { not: id },
            status: { in: [...pending, 'APPROVED'] },
            startDate: { lte: row.endDate },
            endDate: { gte: row.startDate },
          },
        });
        if (overlap)
          fail(
            'LEAVE_OVERLAP',
            'Another application already covers these dates.',
            409,
          );
        if (row.paid) await this.available(tx, row);
        const status: RequestStatus =
          row.approval === 'NO_APPROVAL'
            ? 'APPROVED'
            : row.approval === 'HR_ONLY'
              ? 'PENDING_HR'
              : 'PENDING_MANAGER';
        const data = await tx.leaveRequest.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: {
            status,
            days: row.days,
            managerId: row.managerId,
            approval: row.approval,
            paid: row.paid,
            daySnapshot: current.daySnapshot,
          },
        });
        if (status === 'APPROVED' && row.paid) await this.consume(tx, row);
        await this.event(tx, m, id, 'LEAVE_SUBMITTED', status);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async decide(m: Membership, id: string, d: DecisionDto) {
    decisionComment(d);
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.leaveRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (!pending.includes(row.status))
          fail('INVALID_STATE', 'Request is not awaiting a decision.', 409);
        if (m.employeeId === row.employeeId)
          throw new ForbiddenException('You cannot approve your own request.');
        const allowed =
          row.status === 'PENDING_MANAGER'
            ? m.employeeId === row.managerId || privileged(m, ['OWNER'])
            : privileged(m, ['OWNER', 'HR']);
        if (!allowed) throw new ForbiddenException();
        await this.unlocked(tx, row);
        const status: RequestStatus =
          d.decision === 'REJECT'
            ? 'REJECTED'
            : row.status === 'PENDING_MANAGER' && row.approval === 'MANAGER_HR'
              ? 'PENDING_HR'
              : 'APPROVED';
        if (status === 'APPROVED' && row.paid) {
          await this.available(tx, row);
          await this.consume(tx, row);
        }
        const data = await tx.leaveRequest.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: {
            status,
            decisionComment: d.comment,
            decidedBy: m.userId,
            decidedAt: new Date(),
          },
        });
        await this.event(tx, m, id, 'LEAVE_' + d.decision, status, d.comment);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async cancel(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.leaveRequest.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        mayRead(m, row.employeeId);
        if (['CANCELLED', 'REJECTED'].includes(row.status))
          fail('INVALID_STATE', 'Request cannot be cancelled.', 409);
        if (row.status !== 'DRAFT') await this.unlocked(tx, row);
        const company = await tx.company.findUniqueOrThrow({
          where: { id: m.companyId },
        });
        if (row.startDate < dateOnly(localDate(new Date(), company.timezone)))
          fail(
            'LEAVE_ALREADY_STARTED',
            'Past leave requires an HR correction workflow.',
          );
        if (row.status === 'APPROVED' && row.paid)
          await this.consume(tx, row, true);
        const data = await tx.leaveRequest.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { status: 'CANCELLED' },
        });
        await this.event(tx, m, id, 'LEAVE_CANCELLED', 'CANCELLED');
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async pending(m: Membership, q: PageDto) {
    if (!m.employeeId && !privileged(m, ['OWNER', 'HR']))
      return paginated([], 0, q);
    const where: Prisma.LeaveRequestWhereInput = {
      companyId: m.companyId,
      status: { in: pending },
      ...(privileged(m, ['OWNER'])
        ? {}
        : {
            OR: [
              ...(privileged(m, ['HR'])
                ? [{ status: 'PENDING_HR' as const }]
                : []),
              ...(m.employeeId
                ? [
                    {
                      status: 'PENDING_MANAGER' as const,
                      managerId: m.employeeId,
                    },
                  ]
                : []),
            ],
          }),
    };
    const [data, total] = await this.db.$transaction([
      this.db.leaveRequest.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'asc' },
      }),
      this.db.leaveRequest.count({ where }),
    ]);
    return paginated(data, total, q);
  }
}
