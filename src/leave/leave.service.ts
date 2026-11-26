import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaveApproval,
  Membership,
  Prisma,
  RequestStatus,
} from '@prisma/client';
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
  notifyApproversInTransaction,
  notifyEmployeeInTransaction,
} from '../notifications/notifications.service';
import {
  ACTIVE_STATUS_VALUES,
  makeStatusCounts,
  REQUEST_STATUS_VALUES,
} from '../common/status-summary';
import {
  GrantDto,
  LeaveDto,
  LeavePolicyQueryDto,
  LeavePolicyDto,
  LeaveBalanceQueryDto,
  UpdateLeavePolicyDto,
  LeaveAccrualDto,
  LeaveApplicationQueryDto,
} from './leave.dto';
import {
  accrualDays,
  carryForwardDays,
  syncCompanyLeaveEntitlements,
} from './leave-accrual';
const pending: RequestStatus[] = ['PENDING_MANAGER', 'PENDING_HR'];
const decimalNumber = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : value.toNumber();
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

  private serializeRequest(row: any) {
    return {
      ...row,
      requestDate: row.requestDate ? dateString(row.requestDate) : null,
      startDate: row.startDate ? dateString(row.startDate) : null,
      endDate: row.endDate ? dateString(row.endDate) : null,
    };
  }
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
    if (action === 'LEAVE_APPROVE' || action === 'LEAVE_REJECT') {
      const request = await tx.leaveRequest.findUnique({
        where: { companyId_id: { companyId: m.companyId, id } },
        select: { employeeId: true },
      });
      if (request)
        await notifyEmployeeInTransaction(tx, {
          companyId: m.companyId,
          employeeId: request.employeeId,
          kind: 'LEAVE_DECISION',
          title: status === 'APPROVED' ? 'Leave approved' : 'Leave updated',
          message:
            status === 'APPROVED'
              ? 'Your leave application was approved.'
              : status === 'REJECTED'
                ? 'Your leave application was rejected.'
                : 'Your leave application moved to the next approval stage.',
          dedupeKey: `LEAVE_DECISION:${id}:${status}`,
          sourceType: 'LEAVE_REQUEST',
          sourceId: id,
          settingKey: 'leaveApplications',
          payload: { requestId: id, status },
        });
    }
  }
  async detail(m: Membership, id: string) {
    const data = await this.db.leaveRequest.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
      include: {
        employee: { select: { id: true, employeeNo: true, name: true } },
        policy: true,
        events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        files: {
          where: { archived: false },
          select: { originalName: true },
        },
      },
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
    return { data: this.serializeRequest(data) };
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
            ...(d.reference !== undefined ? { reference: d.reference } : {}),
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
  async policies(m: Membership, q: LeavePolicyQueryDto) {
    const search = q.search?.trim();
    const active = q.isActive;
    const baseWhere = {
      companyId: m.companyId,
      ...(q.paid !== undefined ? { paid: q.paid } : {}),
      ...(q.approval ? { approval: q.approval } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
              {
                description: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const where = {
      ...baseWhere,
      ...(active !== undefined ? { active } : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.leavePolicy.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.leavePolicy.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.leavePolicy.count({
          where: { ...baseWhere, active: status === 'ACTIVE' },
        }),
      ),
    );
    return paginated(
      data.map((row) => this.policyView(row)),
      total,
      q,
      {
        summary: {
          statusCounts: makeStatusCounts(
            ACTIVE_STATUS_VALUES,
            statusCountValues,
          ),
        },
      },
    );
  }
  async policy(m: Membership, id: string) {
    const data = await this.db.leavePolicy.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!data) throw new NotFoundException();
    return { data: this.policyView(data) };
  }

  private policyValues(d: UpdateLeavePolicyDto) {
    const {
      effectiveFrom,
      effectiveTo,
      serviceEntitlementTiers,
      defaultEntitlement,
      maximumCarryForward,
      active,
      status,
      leaveType,
      approvalOverflow,
      minimumAdvanceNotice,
      approval,
      noticeDays,
      paid,
      ...rest
    } = d;
    return {
      ...rest,
      ...(paid !== undefined || leaveType !== undefined
        ? { paid: leaveType ? leaveType === 'PAID' : paid }
        : {}),
      ...(approval !== undefined || approvalOverflow !== undefined
        ? { approval: approval ?? approvalOverflow }
        : {}),
      ...(noticeDays !== undefined || minimumAdvanceNotice !== undefined
        ? { noticeDays: minimumAdvanceNotice ?? noticeDays }
        : {}),
      ...(status !== undefined
        ? { active: status === 'ACTIVE' }
        : active !== undefined
          ? { active }
          : {}),
      ...(serviceEntitlementTiers !== undefined
        ? {
            serviceEntitlementTiers: serviceEntitlementTiers.map((tier) => ({
              serviceFrom: tier.serviceFrom ?? null,
              serviceTo: tier.serviceTo ?? null,
              daysPerYear: tier.daysPerYear ?? null,
            })),
          }
        : {}),
      ...(defaultEntitlement !== undefined
        ? {
            defaultEntitlement:
              defaultEntitlement === null
                ? null
                : new Prisma.Decimal(defaultEntitlement),
          }
        : {}),
      ...(maximumCarryForward !== undefined
        ? {
            maximumCarryForward:
              maximumCarryForward === null
                ? null
                : new Prisma.Decimal(maximumCarryForward),
          }
        : {}),
      ...(effectiveFrom !== undefined
        ? { effectiveFrom: dateOnly(effectiveFrom) }
        : {}),
      ...(effectiveTo !== undefined
        ? { effectiveTo: effectiveTo ? dateOnly(effectiveTo) : null }
        : {}),
    };
  }

  async updatePolicy(m: Membership, id: string, d: UpdateLeavePolicyDto) {
    const existing = await this.db.leavePolicy.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!existing) throw new NotFoundException();
    const effectiveFrom = d.effectiveFrom ?? dateString(existing.effectiveFrom);
    const effectiveTo =
      d.effectiveTo !== undefined
        ? d.effectiveTo
        : existing.effectiveTo
          ? dateString(existing.effectiveTo)
          : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom)
      fail('INVALID_DATES', 'Policy end precedes start.');
    return this.db.$transaction(async (tx) => {
      const data = await tx.leavePolicy.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: this.policyValues(d),
      });
      await audit(tx, m, 'LEAVE_POLICY_UPDATED', id);
      await syncCompanyLeaveEntitlements(
        tx,
        m.companyId,
        new Date().getUTCFullYear(),
      );
      return { data: this.policyView(data) };
    });
  }

  async deactivatePolicy(m: Membership, id: string) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.leavePolicy.findUnique({
        where: { companyId_id: { companyId: m.companyId, id } },
      });
      if (!existing) throw new NotFoundException();
      const active = !existing.active;
      const data = await tx.leavePolicy.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: { active },
      });
      await audit(
        tx,
        m,
        active ? 'LEAVE_POLICY_ACTIVATED' : 'LEAVE_POLICY_DEACTIVATED',
        id,
      );
      await syncCompanyLeaveEntitlements(
        tx,
        m.companyId,
        new Date().getUTCFullYear(),
      );
      return { data: this.policyView(data) };
    });
  }
  async createPolicy(m: Membership, d: LeavePolicyDto) {
    if (d.effectiveTo && d.effectiveTo < d.effectiveFrom)
      fail('INVALID_DATES', 'Policy end precedes start.');
    return this.db.$transaction(async (tx) => {
      const paid = d.leaveType ? d.leaveType === 'PAID' : d.paid;
      const approval = d.approval ?? d.approvalOverflow;
      const noticeDays = d.minimumAdvanceNotice ?? d.noticeDays;
      const data = await tx.leavePolicy.create({
        data: {
          companyId: m.companyId,
          code: d.code,
          name: d.name,
          active: d.status !== 'INACTIVE',
          ...(d.description !== undefined
            ? { description: d.description }
            : {}),
          paid,
          ...(d.entitlementUnit !== undefined
            ? { entitlementUnit: d.entitlementUnit }
            : {}),
          ...(d.entitlementCalculationMethod !== undefined
            ? { entitlementCalculationMethod: d.entitlementCalculationMethod }
            : {}),
          ...(d.serviceEntitlementTiers !== undefined
            ? {
                serviceEntitlementTiers: d.serviceEntitlementTiers.map(
                  (tier) => ({
                    serviceFrom: tier.serviceFrom ?? null,
                    serviceTo: tier.serviceTo ?? null,
                    daysPerYear: tier.daysPerYear ?? null,
                  }),
                ),
              }
            : {}),
          ...(d.entitlementGrantMethod !== undefined
            ? { entitlementGrantMethod: d.entitlementGrantMethod }
            : {}),
          ...(d.eligibility !== undefined
            ? { eligibility: d.eligibility }
            : {}),
          ...(d.leaveYear !== undefined ? { leaveYear: d.leaveYear } : {}),
          ...(d.carryForwardPolicy !== undefined
            ? { carryForwardPolicy: d.carryForwardPolicy }
            : {}),
          ...(d.requireSupportingDocuments !== undefined
            ? { requireSupportingDocuments: d.requireSupportingDocuments }
            : {}),
          ...(d.allowEmployeeSpecificSettings !== undefined
            ? { allowEmployeeSpecificSettings: d.allowEmployeeSpecificSettings }
            : {}),
          allowHalfDay: d.allowHalfDay,
          noticeDays,
          approval,
          effectiveFrom: dateOnly(d.effectiveFrom),
          effectiveTo: d.effectiveTo ? dateOnly(d.effectiveTo) : null,
          ...(d.defaultEntitlement !== undefined
            ? {
                defaultEntitlement:
                  d.defaultEntitlement === null
                    ? null
                    : new Prisma.Decimal(d.defaultEntitlement),
              }
            : {}),
          ...(d.maximumCarryForward !== undefined
            ? {
                maximumCarryForward:
                  d.maximumCarryForward === null
                    ? null
                    : new Prisma.Decimal(d.maximumCarryForward),
              }
            : {}),
        },
      });
      await audit(tx, m, 'LEAVE_POLICY_CREATED', data.id);
      await syncCompanyLeaveEntitlements(
        tx,
        m.companyId,
        new Date().getUTCFullYear(),
      );
      return { data: this.policyView(data) };
    });
  }

  private policyView<
    T extends {
      active: boolean;
      paid: boolean;
      noticeDays: number;
      approval: LeaveApproval;
      defaultEntitlement: Prisma.Decimal | null;
      maximumCarryForward: Prisma.Decimal | null;
    },
  >(data: T) {
    return {
      ...data,
      defaultEntitlement: decimalNumber(data.defaultEntitlement),
      maximumCarryForward: decimalNumber(data.maximumCarryForward),
      status: data.active ? 'ACTIVE' : 'INACTIVE',
      leaveType: data.paid ? 'PAID' : 'UNPAID',
      minimumAdvanceNotice: data.noticeDays,
      approvalOverflow: data.approval,
    };
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

  async accrue(m: Membership, d: LeaveAccrualDto) {
    const start = new Date(Date.UTC(d.year, 0, 1));
    const end = new Date(Date.UTC(d.year, 11, 31));
    return this.db.$transaction(
      async (tx) => {
        const [policies, employees] = await Promise.all([
          tx.leavePolicy.findMany({
            where: {
              companyId: m.companyId,
              active: true,
              effectiveFrom: { lte: end },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
            },
            orderBy: { code: 'asc' },
          }),
          tx.employee.findMany({
            where: {
              companyId: m.companyId,
              joinedDate: { lte: end },
              OR: [
                { resignationDate: null },
                { resignationDate: { gte: start } },
              ],
            },
            select: {
              id: true,
              joinedDate: true,
              resignationDate: true,
              employmentType: true,
              employmentStatus: true,
              active: true,
            },
          }),
        ]);
        const created: {
          employeeId: string;
          policyId: string;
          kind: string;
          days: string;
        }[] = [];
        let skipped = 0;
        for (const employee of employees) {
          for (const policy of policies) {
            const amount = accrualDays(policy, employee, d.year);
            const previous = await tx.leaveLedger.aggregate({
              where: {
                companyId: m.companyId,
                employeeId: employee.id,
                policyId: policy.id,
                year: d.year - 1,
              },
              _sum: { days: true },
            });
            const carry = carryForwardDays(
              policy,
              new Prisma.Decimal(previous._sum.days ?? 0),
            );
            const entries = [
              ...(carry.isZero()
                ? []
                : [
                    {
                      kind: 'CARRY_FORWARD',
                      days: carry,
                      idempotencyKey: `carry-forward:${d.year}:${employee.id}:${policy.id}`,
                      reason: `Carry-forward from leave year ${d.year - 1}`,
                    },
                  ]),
              ...(amount.isZero() || policy.entitlementGrantMethod === 'MANUAL'
                ? []
                : [
                    {
                      kind: 'ACCRUAL',
                      days: amount,
                      idempotencyKey: `accrual:${d.year}:${employee.id}:${policy.id}`,
                      reason: `Automatic ${policy.entitlementGrantMethod.toLowerCase()} entitlement for ${d.year}`,
                    },
                  ]),
            ];
            for (const entry of entries) {
              const existing = await tx.leaveLedger.findUnique({
                where: {
                  companyId_idempotencyKey: {
                    companyId: m.companyId,
                    idempotencyKey: entry.idempotencyKey,
                  },
                },
              });
              if (existing) {
                skipped += 1;
                continue;
              }
              await tx.leaveLedger.create({
                data: {
                  companyId: m.companyId,
                  employeeId: employee.id,
                  policyId: policy.id,
                  year: d.year,
                  days: entry.days,
                  kind: entry.kind,
                  reason: entry.reason,
                  idempotencyKey: entry.idempotencyKey,
                },
              });
              created.push({
                employeeId: employee.id,
                policyId: policy.id,
                kind: entry.kind,
                days: entry.days.toFixed(2),
              });
            }
          }
        }
        await audit(tx, m, 'LEAVE_ACCRUAL_RUN', `leave-accrual:${d.year}`, {
          year: d.year,
          createdCount: created.length,
          skippedCount: skipped,
        });
        return {
          data: {
            year: d.year,
            createdCount: created.length,
            skippedCount: skipped,
            entries: created,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
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
        const selectedPolicyCodes = Array.isArray(e.leavePolicyCodes)
          ? e.leavePolicyCodes
              .filter((code): code is string => typeof code === 'string')
              .map((code) => code.trim().toUpperCase())
              .filter(Boolean)
          : null;
        const policies = await tx.leavePolicy.findMany({
          where: {
            companyId: m.companyId,
            ...(selectedPolicyCodes !== null
              ? { code: { in: selectedPolicyCodes } }
              : {}),
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
              balance: balance.toNumber(),
              reserved: held.toNumber(),
              available: policy.paid ? balance.minus(held).toNumber() : null,
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
          h.status === 'ACTIVE' &&
          (!(h.regions?.length ? h.regions : h.states).length ||
            (location &&
              (h.regions?.length ? h.regions : h.states).includes(
                location.state,
              ))),
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
      requestDate: today,
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
        const { employee, policy, start, end, requestDate, days } =
          await this.eligibility(tx, m, d);
        const data = await tx.leaveRequest.create({
          data: {
            companyId: m.companyId,
            employeeId: employee.id,
            policyId: policy.id,
            requestDate,
            startDate: start,
            endDate: end,
            halfDay: d.halfDay,
            days: d.halfDay ? '0.50' : String(days),
            reason: d.reason,
            ...(d.reference !== undefined ? { reference: d.reference } : {}),
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
  async list(
    m: Membership,
    q: LeaveApplicationQueryDto,
    all = false,
    requestedEmployeeId?: string,
  ) {
    const employeeId = requestedEmployeeId
      ? (
          await this.db.employee.findUnique({
            where: {
              companyId_id: {
                companyId: m.companyId,
                id: requestedEmployeeId,
              },
            },
            select: { id: true },
          })
        )?.id
      : all
        ? q.employeeId
        : (await selfEmployee(this.db, m)).id;
    if (requestedEmployeeId && !employeeId) throw new NotFoundException();
    const where = {
      companyId: m.companyId,
      ...(employeeId ? { employeeId } : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.leaveRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          employee: {
            select: {
              id: true,
              employeeNo: true,
              name: true,
              department: { select: { id: true, name: true } },
            },
          },
          policy: true,
          files: {
            where: { archived: false },
            select: { originalName: true },
          },
        },
      }),
      this.db.leaveRequest.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      REQUEST_STATUS_VALUES.map((status) =>
        this.db.leaveRequest.count({ where: { ...where, status } }),
      ),
    );
    return paginated(
      data.map((row) => this.serializeRequest(row)),
      total,
      q,
      {
        summary: {
          statusCounts: makeStatusCounts(
            REQUEST_STATUS_VALUES,
            statusCountValues,
          ),
        },
      },
    );
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
        if (status === 'PENDING_MANAGER' && row.managerId)
          await notifyApproversInTransaction(tx, {
            companyId: m.companyId,
            employeeId: row.managerId,
            kind: 'LEAVE_APPROVAL_REQUIRED',
            title: 'Leave approval required',
            message: 'A leave application is waiting for your review.',
            dedupeKey: `LEAVE_APPROVAL_REQUIRED:${id}:MANAGER`,
            sourceType: 'LEAVE_REQUEST',
            sourceId: id,
            payload: { status, requestId: id },
            settingKey: 'leaveApplications',
          });
        else if (status === 'PENDING_HR')
          await notifyApproversInTransaction(tx, {
            companyId: m.companyId,
            roles: ['OWNER', 'HR'],
            kind: 'LEAVE_APPROVAL_REQUIRED',
            title: 'Leave approval required',
            message: 'A leave application is waiting for HR review.',
            dedupeKey: `LEAVE_APPROVAL_REQUIRED:${id}:HR`,
            sourceType: 'LEAVE_REQUEST',
            sourceId: id,
            payload: { status, requestId: id },
            settingKey: 'leaveApplications',
          });
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
        if (status === 'PENDING_HR')
          await notifyApproversInTransaction(tx, {
            companyId: m.companyId,
            roles: ['OWNER', 'HR'],
            kind: 'LEAVE_APPROVAL_REQUIRED',
            title: 'Leave approval required',
            message: 'A leave application is waiting for HR review.',
            dedupeKey: `LEAVE_APPROVAL_REQUIRED:${id}:HR`,
            sourceType: 'LEAVE_REQUEST',
            sourceId: id,
            payload: { status, requestId: id },
            settingKey: 'leaveApplications',
          });
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
      return paginated([], 0, q, {
        summary: { statusCounts: makeStatusCounts(REQUEST_STATUS_VALUES) },
      });
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
        include: {
          policy: true,
          files: {
            where: { archived: false },
            select: { originalName: true },
          },
        },
      }),
      this.db.leaveRequest.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      REQUEST_STATUS_VALUES.map((status) =>
        this.db.leaveRequest.count({ where: { ...where, status } }),
      ),
    );
    return paginated(
      data.map((row) => this.serializeRequest(row)),
      total,
      q,
      {
        summary: {
          statusCounts: makeStatusCounts(
            REQUEST_STATUS_VALUES,
            statusCountValues,
          ),
        },
      },
    );
  }
}
