import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import {
  PayrollAdjustmentDto,
  PayrollAdjustmentVoidDto,
} from './payroll-adjustments.dto';
import { payrollPeriod } from './payroll.service';

@Injectable()
export class PayrollAdjustmentsService {
  constructor(private db: Database) {}

  private async run(tx: Prisma.TransactionClient, m: Membership, id: string) {
    const run = await tx.payrollRun.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!run) throw new NotFoundException();
    return run;
  }

  async create(m: Membership, targetRunId: string, d: PayrollAdjustmentDto) {
    if (['BASIC', 'UNPAID_LEAVE'].includes(d.componentCode))
      fail(
        'RESERVED_PAYROLL_COMPONENT',
        'Use a separate correction component; BASIC and UNPAID_LEAVE are generated automatically.',
        400,
      );
    const amount = new Prisma.Decimal(d.amount);
    const reason = d.reason.trim();
    if (
      !reason ||
      !amount.isFinite() ||
      amount.lte(0) ||
      amount.decimalPlaces() > 2 ||
      amount.gte('1000000000000')
    )
      fail(
        'INVALID_PAYROLL_ADJUSTMENT',
        'Provide a positive amount with at most two decimals and a nonblank reason.',
        400,
      );

    return this.db.$transaction(
      async (tx) => {
        const target = await this.run(tx, m, targetRunId);
        const existing = await tx.payrollAdjustment.findUnique({
          where: {
            companyId_targetRunId_idempotencyKey: {
              companyId: m.companyId,
              targetRunId,
              idempotencyKey: d.idempotencyKey,
            },
          },
          include: { input: true },
        });
        if (existing) {
          if (
            existing.sourceRunId !== d.sourceRunId ||
            existing.employeeId !== d.employeeId ||
            existing.componentCode !== d.componentCode ||
            !existing.amount.equals(amount) ||
            existing.reason !== reason
          )
            fail(
              'IDEMPOTENCY_CONFLICT',
              'This request key was already used for a different payroll adjustment.',
              409,
            );
          return { data: this.response(existing) };
        }
        if (target.status !== 'DRAFT')
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'A later-period adjustment can only be added to a draft payroll run.',
            409,
          );
        const source = await this.run(tx, m, d.sourceRunId);
        if (!['PUBLISHED', 'PAID'].includes(source.status))
          fail(
            'SOURCE_PAYROLL_NOT_FINALIZED',
            'The source payroll must be published or paid before it can be corrected.',
            409,
          );
        if (
          source.id === target.id ||
          source.year * 12 + source.month >= target.year * 12 + target.month
        )
          fail(
            'INVALID_ADJUSTMENT_PERIOD',
            'The target payroll must be a later month than the finalized source payroll.',
            400,
          );
        const sourceEmployee = await tx.payrollEmployee.findUnique({
          where: {
            companyId_runId_employeeId: {
              companyId: m.companyId,
              runId: source.id,
              employeeId: d.employeeId,
            },
          },
        });
        if (!sourceEmployee) throw new NotFoundException();
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: d.employeeId } },
        });
        if (!employee) throw new NotFoundException();
        const { next, start } = payrollPeriod(target.year, target.month);
        if (!employee.active || employee.joinedDate >= next)
          fail(
            'EMPLOYEE_NOT_ELIGIBLE',
            'Employee is not eligible for the target payroll period.',
            422,
          );
        const definition = await tx.payrollComponentDefinition.findFirst({
          where: {
            companyId: m.companyId,
            code: d.componentCode,
            effectiveFrom: { lte: start },
          },
          orderBy: { revision: 'desc' },
        });
        if (!definition?.active)
          fail(
            'COMPONENT_UNAVAILABLE',
            'An active component definition must cover the target payroll month.',
            422,
          );
        const inputConflict = await tx.payrollInput.findUnique({
          where: {
            companyId_runId_idempotencyKey: {
              companyId: m.companyId,
              runId: target.id,
              idempotencyKey: d.idempotencyKey,
            },
          },
        });
        if (inputConflict)
          fail(
            'IDEMPOTENCY_CONFLICT',
            'This request key is already used by another target payroll input.',
            409,
          );
        const count = await tx.payrollInput.count({
          where: {
            companyId: m.companyId,
            runId: target.id,
            employeeId: d.employeeId,
            voidedAt: null,
          },
        });
        if (count >= 500)
          fail(
            'PAYROLL_INPUT_LIMIT',
            'An employee may have at most 500 active manual inputs per run.',
          );
        const input = await tx.payrollInput.create({
          data: {
            companyId: m.companyId,
            runId: target.id,
            employeeId: d.employeeId,
            idempotencyKey: d.idempotencyKey,
            componentCode: d.componentCode,
            amount,
            reason,
            createdBy: m.userId,
          },
        });
        const adjustment = await tx.payrollAdjustment.create({
          data: {
            companyId: m.companyId,
            sourceRunId: source.id,
            targetRunId: target.id,
            employeeId: d.employeeId,
            inputId: input.id,
            idempotencyKey: d.idempotencyKey,
            componentCode: d.componentCode,
            amount,
            reason,
            createdBy: m.userId,
          },
          include: { input: true },
        });
        await audit(tx, m, 'PAYROLL_ADJUSTMENT_CREATED', adjustment.id);
        return { data: this.response(adjustment) };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async list(m: Membership, targetRunId: string, q: PageDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.run(tx, m, targetRunId);
        const where = { companyId: m.companyId, targetRunId };
        const [data, total] = await Promise.all([
          tx.payrollAdjustment.findMany({
            where,
            include: { input: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          tx.payrollAdjustment.count({ where }),
        ]);
        return paginated(
          data.map((row) => this.response(row)),
          total,
          q,
        );
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async void(
    m: Membership,
    targetRunId: string,
    id: string,
    d: PayrollAdjustmentVoidDto,
  ) {
    const reason = d.reason.trim();
    if (!reason)
      fail(
        'INVALID_PAYROLL_ADJUSTMENT',
        'A nonblank void reason is required.',
        400,
      );
    return this.db.$transaction(
      async (tx) => {
        const target = await this.run(tx, m, targetRunId);
        if (target.status !== 'DRAFT')
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'A later-period adjustment can only be voided while the target payroll is draft.',
            409,
          );
        const adjustment = await tx.payrollAdjustment.findFirst({
          where: { id, companyId: m.companyId, targetRunId },
          include: { input: true },
        });
        if (!adjustment) throw new NotFoundException();
        if (adjustment.input.voidedAt) {
          if (adjustment.input.voidReason !== reason)
            fail(
              'INPUT_ALREADY_VOIDED',
              'The adjustment was already voided with a different reason.',
              409,
            );
          return { data: this.response(adjustment) };
        }
        const voidedAt = new Date();
        await tx.payrollInput.update({
          where: { id: adjustment.inputId },
          data: { voidedAt, voidedBy: m.userId, voidReason: reason },
        });
        await audit(tx, m, 'PAYROLL_ADJUSTMENT_VOIDED', adjustment.id);
        return {
          data: this.response({
            ...adjustment,
            input: { ...adjustment.input, voidedAt, voidReason: reason },
          }),
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private response(row: any) {
    return {
      ...row,
      amount: row.amount.toFixed(2),
      createdAt: row.createdAt.toISOString(),
      voidedAt: row.input?.voidedAt?.toISOString() ?? null,
      voidReason: row.input?.voidReason ?? null,
      input: undefined,
    };
  }
}
