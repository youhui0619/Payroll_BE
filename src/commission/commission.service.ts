import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { paginated } from '../common/page.dto';
import {
  ACTIVE_STATUS_VALUES,
  makeStatusCounts,
} from '../common/status-summary';
import {
  audit,
  dateOnly,
  dateString,
  DecisionDto,
  decisionComment,
  fail,
  privileged,
} from '../common/domain';
import {
  CommissionRecordDto,
  CommissionRecordQueryDto,
  CommissionSettingDto,
  CommissionSettingQueryDto,
  COMMISSION_METHODS,
  ELIGIBILITY_OPTIONS,
  RECORD_STATUSES,
  UpdateCommissionSettingDto,
} from './commission.dto';

type SettingInput = Partial<CommissionSettingDto> & { active?: boolean };
const RATE_METHODS = [
  'PERCENTAGE_OF_SALES',
  'PERCENTAGE_OF_REVENUE',
  'PERCENTAGE_OF_PROFIT',
  'TIERED_RATE',
] as const;

const decimalNumber = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : value.toNumber();

@Injectable()
export class CommissionService {
  constructor(private db: Database) {}

  private settingInclude = { _count: { select: { records: true } } };

  private usesRate(method: string) {
    return (RATE_METHODS as readonly string[]).includes(method);
  }

  private settingValues(input: SettingInput, current?: any) {
    const get = <K extends keyof SettingInput>(key: K) =>
      input[key] !== undefined ? input[key] : current?.[key];
    const code = String(get('code') ?? '')
      .trim()
      .toUpperCase();
    const name = String(get('name') ?? '').trim();
    const commissionType = get('commissionType');
    const calculationMethod = get('calculationMethod');
    const calculationFrequency = get('calculationFrequency') ?? 'MONTHLY';
    const payoutTiming = get('payoutTiming') ?? 'CURRENT_PAYROLL';
    const eligibleEmployees = get('eligibleEmployees') ?? 'ALL_EMPLOYEES';
    const payrollEarningCode = String(get('payrollEarningCode') ?? '')
      .trim()
      .toUpperCase();
    const description = get('description');
    const rate = get('rate');
    const amount = get('amount');
    const eligibleDepartmentIds = get('eligibleDepartmentIds') ?? [];
    const eligiblePositionIds = get('eligiblePositionIds') ?? [];
    const eligibleEmployeeIds = get('eligibleEmployeeIds') ?? [];
    if (
      !code ||
      !name ||
      !commissionType ||
      !calculationMethod ||
      !payrollEarningCode
    )
      fail(
        'INVALID_COMMISSION_SETTING',
        'Code, name, method and earning code are required.',
        400,
      );
    if (!(COMMISSION_METHODS as readonly string[]).includes(calculationMethod))
      fail(
        'INVALID_COMMISSION_METHOD',
        'Choose a supported commission calculation method.',
        400,
      );
    if (!(ELIGIBILITY_OPTIONS as readonly string[]).includes(eligibleEmployees))
      fail(
        'INVALID_ELIGIBILITY',
        'Choose a supported employee eligibility option.',
        400,
      );
    const selectedIds =
      eligibleEmployees === 'SELECTED_DEPARTMENTS'
        ? eligibleDepartmentIds
        : eligibleEmployees === 'SELECTED_POSITIONS'
          ? eligiblePositionIds
          : eligibleEmployees === 'SELECTED_EMPLOYEES'
            ? eligibleEmployeeIds
            : [];
    if (
      eligibleEmployees !== 'ALL_EMPLOYEES' &&
      (!Array.isArray(selectedIds) || !selectedIds.length)
    )
      fail(
        'ELIGIBILITY_REQUIRED',
        'Select at least one eligible employee target.',
        400,
      );
    if (this.usesRate(calculationMethod)) {
      if (
        rate === undefined ||
        rate === null ||
        new Prisma.Decimal(String(rate)).lt(0)
      )
        fail(
          'RATE_REQUIRED',
          'A non-negative commission rate is required.',
          400,
        );
      if (amount !== undefined && amount !== null)
        fail(
          'INVALID_COMMISSION_AMOUNT',
          'Rate-based plans cannot define a fixed amount.',
          400,
        );
    } else {
      if (
        amount === undefined ||
        amount === null ||
        new Prisma.Decimal(String(amount)).lt(0)
      )
        fail(
          'AMOUNT_REQUIRED',
          'A non-negative fixed amount is required.',
          400,
        );
      if (rate !== undefined && rate !== null)
        fail(
          'INVALID_COMMISSION_RATE',
          'Fixed plans cannot define a percentage rate.',
          400,
        );
    }
    return {
      code,
      name,
      commissionType,
      calculationMethod,
      rate: this.usesRate(calculationMethod)
        ? new Prisma.Decimal(String(rate))
        : null,
      amount: this.usesRate(calculationMethod)
        ? null
        : new Prisma.Decimal(String(amount)),
      calculationFrequency,
      payoutTiming,
      description: description?.trim() || null,
      eligibleEmployees,
      eligibleDepartmentIds:
        eligibleEmployees === 'SELECTED_DEPARTMENTS'
          ? eligibleDepartmentIds
          : [],
      eligiblePositionIds:
        eligibleEmployees === 'SELECTED_POSITIONS' ? eligiblePositionIds : [],
      eligibleEmployeeIds:
        eligibleEmployees === 'SELECTED_EMPLOYEES' ? eligibleEmployeeIds : [],
      payrollEarningCode,
      requiresApproval: get('requiresApproval') ?? true,
      ...(get('active') !== undefined ? { active: get('active') } : {}),
    };
  }

  private serializeSetting(row: any) {
    return {
      ...row,
      rate: decimalNumber(row.rate),
      amount: decimalNumber(row.amount),
    };
  }

  async listSettings(m: Membership, q: CommissionSettingQueryDto) {
    const baseWhere: Prisma.CommissionIncentiveSettingWhereInput = {
      companyId: m.companyId,
      ...(q.search
        ? {
            OR: [
              { code: { contains: q.search, mode: 'insensitive' } },
              { name: { contains: q.search, mode: 'insensitive' } },
              {
                payrollEarningCode: { contains: q.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };
    const where: Prisma.CommissionIncentiveSettingWhereInput = {
      ...baseWhere,
      active: q.active,
    };
    const [rows, total] = await this.db.$transaction([
      this.db.commissionIncentiveSetting.findMany({
        where,
        include: this.settingInclude,
        orderBy: [{ active: 'desc' }, { code: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.commissionIncentiveSetting.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.commissionIncentiveSetting.count({
          where: { ...baseWhere, active: status === 'ACTIVE' },
        }),
      ),
    );
    return paginated(
      rows.map((row) => this.serializeSetting(row)),
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

  async setting(m: Membership, id: string) {
    const row = await this.db.commissionIncentiveSetting.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
      include: this.settingInclude,
    });
    if (!row) throw new NotFoundException();
    return { data: this.serializeSetting(row) };
  }

  async createSetting(m: Membership, d: CommissionSettingDto) {
    const values = this.settingValues(d);
    return this.db.$transaction(
      async (tx) => {
        const duplicate = await tx.commissionIncentiveSetting.findFirst({
          where: { companyId: m.companyId, code: values.code },
        });
        if (duplicate)
          fail(
            'COMMISSION_CODE_EXISTS',
            'Commission code already exists.',
            409,
          );
        const data = await tx.commissionIncentiveSetting.create({
          data: { ...values, companyId: m.companyId },
          include: this.settingInclude,
        });
        await audit(tx, m, 'COMMISSION_SETTING_CREATED', data.id);
        return { data: this.serializeSetting(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async updateSetting(
    m: Membership,
    id: string,
    d: UpdateCommissionSettingDto,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const current = await tx.commissionIncentiveSetting.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!current) throw new NotFoundException();
        const values = this.settingValues(d, current);
        const duplicate = await tx.commissionIncentiveSetting.findFirst({
          where: { companyId: m.companyId, code: values.code, id: { not: id } },
        });
        if (duplicate)
          fail(
            'COMMISSION_CODE_EXISTS',
            'Commission code already exists.',
            409,
          );
        const data = await tx.commissionIncentiveSetting.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: values,
          include: this.settingInclude,
        });
        await audit(tx, m, 'COMMISSION_SETTING_UPDATED', id);
        return { data: this.serializeSetting(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async deactivateSetting(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const current = await tx.commissionIncentiveSetting.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!current) throw new NotFoundException();
        const active = !current.active;
        const data = await tx.commissionIncentiveSetting.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { active },
          include: this.settingInclude,
        });
        await audit(
          tx,
          m,
          active
            ? 'COMMISSION_SETTING_ACTIVATED'
            : 'COMMISSION_SETTING_DEACTIVATED',
          id,
        );
        return { data: this.serializeSetting(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async resolveSetting(
    tx: Prisma.TransactionClient,
    m: Membership,
    d: CommissionRecordDto,
  ) {
    const row = d.settingId
      ? await tx.commissionIncentiveSetting.findFirst({
          where: { companyId: m.companyId, id: d.settingId, active: true },
        })
      : d.planCode
        ? await tx.commissionIncentiveSetting.findFirst({
            where: {
              companyId: m.companyId,
              code: d.planCode.trim().toUpperCase(),
              active: true,
            },
          })
        : null;
    if (!row) throw new NotFoundException('Active commission plan not found.');
    return row;
  }

  private async resolveRecordEmployee(
    tx: Prisma.TransactionClient,
    m: Membership,
    employeeId: string,
  ) {
    const employee = await tx.employee.findFirst({
      where: { companyId: m.companyId, id: employeeId, active: true },
    });
    if (!employee) throw new NotFoundException('Active employee not found.');
    return employee;
  }

  private validateEligibility(setting: any, employee: any) {
    const valid =
      setting.eligibleEmployees === 'ALL_EMPLOYEES' ||
      (setting.eligibleEmployees === 'SELECTED_DEPARTMENTS' &&
        setting.eligibleDepartmentIds.includes(employee.departmentId)) ||
      (setting.eligibleEmployees === 'SELECTED_POSITIONS' &&
        setting.eligiblePositionIds.includes(employee.positionId)) ||
      (setting.eligibleEmployees === 'SELECTED_EMPLOYEES' &&
        setting.eligibleEmployeeIds.includes(employee.id));
    if (!valid)
      fail(
        'EMPLOYEE_NOT_ELIGIBLE',
        'Employee is not eligible for this commission plan.',
        422,
      );
  }

  private recordInclude = {
    employee: { select: { id: true, employeeNo: true, name: true } },
    setting: { select: { id: true, code: true, name: true } },
  };

  private serializeRecord(row: any) {
    return {
      ...row,
      rate: decimalNumber(row.rate),
      amount: decimalNumber(row.amount),
      calculationBasis: decimalNumber(row.calculationBasis),
      createdDate: dateString(row.createdDate),
    };
  }

  async createRecord(m: Membership, d: CommissionRecordDto) {
    return this.db.$transaction(
      async (tx) => {
        const [employee, setting] = await Promise.all([
          this.resolveRecordEmployee(tx, m, d.employeeId),
          this.resolveSetting(tx, m, d),
        ]);
        this.validateEligibility(setting, employee);
        const basis =
          d.calculationBasis === undefined || d.calculationBasis === null
            ? null
            : new Prisma.Decimal(d.calculationBasis);
        const rate = setting.rate;
        let amount = setting.amount;
        if (this.usesRate(setting.calculationMethod)) {
          if (!basis || !rate)
            fail(
              'CALCULATION_BASIS_REQUIRED',
              'Provide a calculation basis for a rate-based plan.',
              400,
            );
          amount = basis.mul(rate).div(100).toDecimalPlaces(2);
        }
        if (!amount || amount.lt(0))
          fail(
            'COMMISSION_AMOUNT_INVALID',
            'Commission amount must be non-negative.',
            400,
          );
        const data = await tx.commissionPayrollRecord.create({
          data: {
            companyId: m.companyId,
            employeeId: employee.id,
            settingId: setting.id,
            planCode: setting.code,
            planName: setting.name,
            payrollEarningCode: setting.payrollEarningCode,
            calculationMethod: setting.calculationMethod,
            calculationFrequency: setting.calculationFrequency,
            payoutTiming: setting.payoutTiming,
            calculationBasis: basis,
            rate,
            amount,
            referenceId: d.referenceId?.trim() || null,
            notes: d.notes?.trim() || null,
            createdDate: d.createdDate
              ? dateOnly(d.createdDate)
              : dateOnly(dateString(new Date())),
            status: setting.requiresApproval
              ? 'PENDING_APPROVAL'
              : 'READY_FOR_PAYROLL',
          },
          include: this.recordInclude,
        });
        await audit(tx, m, 'COMMISSION_RECORD_CREATED', data.id);
        return { data: this.serializeRecord(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async record(m: Membership, id: string) {
    const row = await this.db.commissionPayrollRecord.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
      include: this.recordInclude,
    });
    if (!row) throw new NotFoundException();
    return { data: this.serializeRecord(row) };
  }

  async listRecords(
    m: Membership,
    q: CommissionRecordQueryDto,
    pending = false,
  ) {
    if (!privileged(m, ['OWNER', 'HR', 'FINANCE']))
      return paginated([], 0, q, {
        summary: { statusCounts: makeStatusCounts(RECORD_STATUSES) },
      });
    if (q.from && q.to && q.to < q.from)
      fail('INVALID_RANGE', 'End date precedes start date.', 400);
    const baseWhere: Prisma.CommissionPayrollRecordWhereInput = {
      companyId: m.companyId,
      employeeId: q.employeeId,
      ...(q.planCode ? { planCode: q.planCode.trim().toUpperCase() } : {}),
      ...(q.from || q.to
        ? {
            createdDate: {
              ...(q.from ? { gte: dateOnly(q.from) } : {}),
              ...(q.to ? { lte: dateOnly(q.to) } : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            OR: [
              { id: q.search },
              { planCode: { contains: q.search, mode: 'insensitive' } },
              { planName: { contains: q.search, mode: 'insensitive' } },
              { referenceId: { contains: q.search, mode: 'insensitive' } },
              {
                employee: { name: { contains: q.search, mode: 'insensitive' } },
              },
              {
                employee: {
                  employeeNo: { contains: q.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const where: Prisma.CommissionPayrollRecordWhereInput = {
      ...baseWhere,
      ...(pending
        ? { status: 'PENDING_APPROVAL' }
        : q.status
          ? { status: q.status }
          : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.commissionPayrollRecord.findMany({
        where,
        include: this.recordInclude,
        orderBy: [{ createdDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.commissionPayrollRecord.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      RECORD_STATUSES.map((status) =>
        this.db.commissionPayrollRecord.count({
          where: {
            ...baseWhere,
            ...(pending ? { status: 'PENDING_APPROVAL' } : { status }),
          },
        }),
      ),
    );
    return paginated(
      rows.map((row) => this.serializeRecord(row)),
      total,
      q,
      {
        summary: {
          statusCounts: makeStatusCounts(RECORD_STATUSES, statusCountValues),
        },
      },
    );
  }

  async decideRecord(m: Membership, id: string, d: DecisionDto) {
    decisionComment(d);
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.commissionPayrollRecord.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (row.status !== 'PENDING_APPROVAL')
          fail(
            'INVALID_STATE',
            'Commission record is not awaiting approval.',
            409,
          );
        const status =
          d.decision === 'APPROVE' ? 'READY_FOR_PAYROLL' : 'REJECTED';
        const data = await tx.commissionPayrollRecord.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: {
            status,
            approvedBy: d.decision === 'APPROVE' ? m.userId : null,
            approvedAt: d.decision === 'APPROVE' ? new Date() : null,
            approvalComment: d.comment?.trim() || null,
          },
          include: this.recordInclude,
        });
        await audit(tx, m, `COMMISSION_RECORD_${d.decision}`, id);
        return { data: this.serializeRecord(data) };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
