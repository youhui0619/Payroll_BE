import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { audit, dateOnly, fail, privileged } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import { CalculationPreviewDto } from './calculation-preview.dto';
import { CalculationPreviewService } from './calculation-preview.service';
import {
  CalculatePayrollDto,
  PayrollPaymentDto,
} from './payroll-execution.dto';

const jsonValue = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const amount = (value: unknown) => Number(value ?? 0);

@Injectable()
export class PayrollExecutionService {
  constructor(
    private db: Database,
    private calculations: CalculationPreviewService,
  ) {}

  private async run(tx: Prisma.TransactionClient, m: Membership, id: string) {
    const run = await tx.payrollRun.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!run) throw new NotFoundException();
    return run;
  }

  private executionResponse(
    run: {
      id: string;
      companyId: string;
      year: number;
      month: number;
      status: string;
    },
    employeeCount: number,
  ) {
    return {
      data: {
        id: run.id,
        companyId: run.companyId,
        year: run.year,
        month: run.month,
        status: run.status,
        employeeCount,
      },
    };
  }

  async calculate(m: Membership, runId: string, d: CalculatePayrollDto) {
    return this.db.$transaction(
      async (tx) => {
        const run = await this.run(tx, m, runId);
        if (run.status !== 'DRAFT')
          fail(
            'INVALID_STATE',
            'Only a draft payroll run can be calculated.',
            409,
          );
        const employees = await tx.employee.findMany({
          where: {
            companyId: m.companyId,
            active: true,
            joinedDate: { lt: new Date(Date.UTC(run.year, run.month, 1)) },
          },
          include: { department: true, position: true },
          orderBy: [{ employeeNo: 'asc' }, { id: 'asc' }],
          take: 5001,
        });
        if (employees.length > 5000)
          fail(
            'PAYROLL_EMPLOYEE_LIMIT',
            'Payroll supports up to 5000 employees.',
          );
        if (!employees.length)
          fail(
            'PAYROLL_EMPLOYEES_REQUIRED',
            'No active employees are eligible for this payroll run.',
          );
        const company = await tx.company.findUniqueOrThrow({
          where: { id: m.companyId },
        });
        const snapshots: {
          employeeId: string;
          gross: string;
          deductions: string;
          net: string;
          employerContributions: string;
          snapshot: Prisma.InputJsonValue;
        }[] = [];
        for (const employee of employees) {
          const result = await this.calculations.calculateInTransaction(
            tx,
            m,
            runId,
            employee.id,
            d as CalculationPreviewDto,
          );
          const calculation = result.data;
          snapshots.push({
            employeeId: employee.id,
            gross: calculation.totals.gross,
            deductions: calculation.totals.deductions,
            net: calculation.totals.net,
            employerContributions: calculation.totals.employerContributions,
            snapshot: jsonValue({
              version: 1,
              companyId: m.companyId,
              runId,
              year: run.year,
              month: run.month,
              company: {
                name: company.name,
                registrationNumber: company.registrationNo,
                address: [
                  company.businessAddressLine1,
                  company.businessAddressLine2,
                  company.businessCity,
                  company.businessPostcode,
                  company.businessState,
                  company.businessCountry,
                ]
                  .filter(Boolean)
                  .join(', '),
              },
              employee: {
                id: employee.employeeNo,
                employeeId: employee.id,
                employeeNo: employee.employeeNo,
                name: employee.name,
                position: employee.position?.title ?? null,
                department: employee.department?.name ?? null,
                epfMembershipNumber: employee.epfEmployeeNo,
                gender: employee.gender,
                employmentType: employee.employmentType,
                paymentMethod: employee.paymentMethod,
                bank: employee.bank,
                bankAccount: employee.bankAccount,
              },
              input: calculation.input,
              pcb: calculation.pcb,
              totals: calculation.totals,
              taxPeriod: calculation.taxPeriod,
              taxReview: calculation.taxReview,
            }),
          });
        }
        await tx.payrollEmployee.deleteMany({
          where: { companyId: m.companyId, runId },
        });
        await tx.payrollEmployee.createMany({
          data: snapshots.map((row) => ({
            companyId: m.companyId,
            runId,
            employeeId: row.employeeId,
            gross: row.gross,
            deductions: row.deductions,
            net: row.net,
            employerContributions: row.employerContributions,
            snapshot: row.snapshot,
          })),
        });
        const updated = await tx.payrollRun.update({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
          data: { status: 'CALCULATED' },
        });
        await audit(tx, m, 'PAYROLL_CALCULATED', runId);
        return this.executionResponse(updated, snapshots.length);
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async approve(m: Membership, runId: string) {
    return this.db.$transaction(
      async (tx) => {
        const run = await this.run(tx, m, runId);
        if (run.status !== 'CALCULATED')
          fail(
            'INVALID_STATE',
            'Only a calculated payroll run can be approved.',
            409,
          );
        const settings = await tx.payrollSettings.findUnique({
          where: { companyId: m.companyId },
        });
        if (settings?.makerChecker && run.createdBy === m.userId)
          fail(
            'MAKER_CHECKER_REQUIRED',
            'A payroll creator cannot approve the same run when maker-checker is enabled.',
            403,
          );
        const count = await tx.payrollEmployee.count({
          where: { companyId: m.companyId, runId },
        });
        if (!count)
          fail(
            'PAYROLL_NOT_CALCULATED',
            'Calculate payroll before approval.',
            409,
          );
        const updated = await tx.payrollRun.update({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
          data: {
            status: 'APPROVED',
            approvedBy: m.userId,
            approvedAt: new Date(),
          },
        });
        await audit(tx, m, 'PAYROLL_APPROVED', runId);
        return this.executionResponse(updated, count);
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async publish(m: Membership, runId: string) {
    return this.db.$transaction(
      async (tx) => {
        const run = await this.run(tx, m, runId);
        if (run.status !== 'APPROVED')
          fail(
            'INVALID_STATE',
            'Only an approved payroll run can be published.',
            409,
          );
        const rows = await tx.payrollEmployee.findMany({
          where: { companyId: m.companyId, runId },
          include: { employee: true },
        });
        if (!rows.length)
          fail(
            'PAYROLL_NOT_CALCULATED',
            'Calculate payroll before publication.',
            409,
          );
        const settings = await tx.payslipSettings.findUnique({
          where: { companyId: m.companyId },
        });
        const format =
          settings?.payslipNumberFormat ?? 'PAY-{YYYY}-{MM}-{EMPLOYEE_ID}';
        const publishedAt = new Date();
        for (const row of rows) {
          const number = format
            .replaceAll('{YYYY}', String(run.year))
            .replaceAll('{MM}', String(run.month).padStart(2, '0'))
            .replaceAll('{EMPLOYEE_ID}', row.employee.employeeNo);
          await tx.payrollEmployee.update({
            where: {
              companyId_runId_employeeId: {
                companyId: m.companyId,
                runId,
                employeeId: row.employeeId,
              },
            },
            data: {
              payslipNumber: number,
              publishedAt,
              snapshot: jsonValue({
                ...(row.snapshot as Record<string, unknown>),
                payslipSettings: settings
                  ? {
                      pageSize: settings.pageSize,
                      pageOrientation: settings.pageOrientation,
                      employeeDetails: settings.employeeDetails,
                      departmentAndPosition: settings.departmentAndPosition,
                      employmentType: settings.employmentType,
                      payPeriodAndPaymentDate: settings.payPeriodAndPaymentDate,
                      salaryAndEarnings: settings.salaryAndEarnings,
                      itemizedDeductions: settings.itemizedDeductions,
                      employerContributions: settings.employerContributions,
                      yearToDateTotals: settings.yearToDateTotals,
                      leaveBalance: settings.leaveBalance,
                      employeeExpensesList: settings.employeeExpensesList,
                      dailyAttendanceRecord: settings.dailyAttendanceRecord,
                      leaveList: settings.leaveList,
                      bankAccountDetails: settings.bankAccountDetails,
                      maskBankAccountNumber: settings.maskBankAccountNumber,
                      displayFooterMessage: settings.displayFooterMessage,
                      footerText: settings.footerText,
                    }
                  : null,
              }),
            },
          });
        }
        const updated = await tx.payrollRun.update({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
          data: { status: 'PUBLISHED', publishedAt },
        });
        await audit(tx, m, 'PAYROLL_PUBLISHED', runId);
        return this.executionResponse(updated, rows.length);
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async pay(m: Membership, runId: string, d: PayrollPaymentDto) {
    if (!d.paymentReference.trim())
      fail('PAYMENT_REFERENCE_REQUIRED', 'Provide a payment reference.', 400);
    return this.db.$transaction(
      async (tx) => {
        const run = await this.run(tx, m, runId);
        if (run.status !== 'PUBLISHED')
          fail(
            'INVALID_STATE',
            'Only a published payroll run can be paid.',
            409,
          );
        const count = await tx.payrollEmployee.count({
          where: { companyId: m.companyId, runId },
        });
        const paidAt = d.paymentDate ? dateOnly(d.paymentDate) : new Date();
        await tx.claim.updateMany({
          where: {
            companyId: m.companyId,
            payrollRunId: runId,
            paymentMethod: 'PAYROLL',
            status: 'APPROVED',
          },
          data: {
            status: 'PAID',
            paymentDate: paidAt,
            paymentReference: d.paymentReference.trim(),
          },
        });
        await tx.commissionPayrollRecord.updateMany({
          where: {
            companyId: m.companyId,
            payrollRunId: runId,
            status: 'READY_FOR_PAYROLL',
          },
          data: { status: 'PAID' },
        });
        await tx.overtimeRequest.updateMany({
          where: {
            companyId: m.companyId,
            payrollRunId: runId,
            status: 'APPROVED',
          },
          data: { status: 'PAID' },
        });
        const updated = await tx.payrollRun.update({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
          data: {
            status: 'PAID',
            paidAt,
            paymentReference: d.paymentReference.trim(),
          },
        });
        await audit(tx, m, 'PAYROLL_PAID', runId);
        return this.executionResponse(updated, count);
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private canReadPayslip(m: Membership, employeeId: string) {
    if (
      privileged(m, ['OWNER', 'HR', 'FINANCE']) ||
      m.employeeId === employeeId
    )
      return;
    throw new NotFoundException();
  }

  private payslipData(row: any, run: any) {
    const snapshot = row.snapshot as any;
    const settings = snapshot.payslipSettings ?? {};
    const visible = (key: string, fallback = true) =>
      typeof settings[key] === 'boolean' ? settings[key] : fallback;
    const lines = snapshot.totals.lines ?? [];
    const statutory = snapshot.totals.statutory ?? [];
    const lineAmount = (code: string, kind?: string) =>
      lines
        .filter(
          (line: any) => line.code === code && (!kind || line.kind === kind),
        )
        .reduce((sum: number, line: any) => sum + amount(line.amount), 0);
    const sourceAmount = (sourceType: string) =>
      lines
        .filter(
          (line: any) =>
            line.source?.type === sourceType && line.kind === 'EARNING',
        )
        .reduce((sum: number, line: any) => sum + amount(line.amount), 0);
    const contribution = (
      scheme: string,
      field: 'employeeDeduction' | 'employerCost',
    ) => amount(statutory.find((row: any) => row.scheme === scheme)?.[field]);
    const componentDeductions = lines
      .filter((line: any) => line.kind === 'DEDUCTION')
      .reduce((sum: number, line: any) => sum + amount(line.amount), 0);
    const unpaidLeave = lineAmount('UNPAID_LEAVE', 'DEDUCTION');
    const advance = lineAmount('ADVANCE', 'DEDUCTION');
    const other = componentDeductions - unpaidLeave - advance;
    const leaveReferences =
      snapshot.input.salaryTrace?.unpaidSources?.map(
        (source: any) => source.sourceId,
      ) ?? [];
    const claimReferences =
      snapshot.input.claimSources?.map((source: any) => source.id) ?? [];
    const commissionReferences =
      snapshot.input.commissionSources?.map((source: any) => source.id) ?? [];
    const employee = { ...(snapshot.employee ?? {}) };
    if (!visible('departmentAndPosition')) {
      employee.department = null;
      employee.position = null;
    }
    if (!visible('employmentType')) employee.employmentType = null;
    if (!visible('bankAccountDetails', false)) {
      employee.bank = null;
      employee.bankAccount = null;
    } else if (employee.bankAccount && visible('maskBankAccountNumber', true)) {
      const account = String(employee.bankAccount);
      employee.bankAccount =
        account.length > 4
          ? '*'.repeat(account.length - 4) + account.slice(-4)
          : account;
    }
    const earnings = {
      basicPay: lineAmount('BASIC', 'EARNING'),
      unpaidLeave,
      overtime: sourceAmount('OVERTIME'),
      allowance: sourceAmount('CLAIM'),
      bonus: lineAmount('BONUS', 'EARNING'),
      commissions: sourceAmount('COMMISSION'),
      commissionItems: snapshot.input.commissionSources ?? [],
      grossPay: amount(snapshot.totals.gross),
    };
    const deductions = {
      epf: contribution('EPF', 'employeeDeduction'),
      socso: contribution('SOCSO', 'employeeDeduction'),
      lindungan24Jam: contribution('LINDUNG_24_JAM', 'employeeDeduction'),
      eis: contribution('EIS', 'employeeDeduction'),
      pcb: contribution('PCB', 'employeeDeduction'),
      advance,
      other: Math.max(0, other),
      total: amount(snapshot.totals.deductions),
    };
    return {
      employeeId: row.employeeId,
      period: visible('payPeriodAndPaymentDate')
        ? `${run.year}-${String(run.month).padStart(2, '0')}`
        : null,
      status: run.status === 'PAID' ? 'Paid' : 'Published',
      payslipNumber: row.payslipNumber,
      leaveReferences,
      claimReferences,
      commissionReferences,
      company: snapshot.company,
      employee: visible('employeeDetails') ? employee : { id: employee.id },
      leaveBalances: visible('leaveBalance')
        ? {
            annual: { available: 0, granted: 0, taken: 0, carriedForward: 0 },
            medical: { available: 0, granted: 0, taken: 0, carriedForward: 0 },
          }
        : null,
      earnings: visible('salaryAndEarnings') ? earnings : null,
      deductions: visible('itemizedDeductions') ? deductions : null,
      employerContributions: visible('employerContributions')
        ? {
            epf: contribution('EPF', 'employerCost'),
            socso: contribution('SOCSO', 'employerCost'),
            eis: contribution('EIS', 'employerCost'),
          }
        : null,
      contributionBases: {
        epf: amount(snapshot.totals.bases?.EPF),
        perkeso: amount(snapshot.totals.bases?.SOCSO),
      },
      netPay: amount(snapshot.totals.net),
      paymentMethod: snapshot.employee?.paymentMethod ?? null,
      payslipSettings: settings,
      footerMessage: visible('displayFooterMessage', false)
        ? (settings.footerText ?? '')
        : null,
    };
  }

  async payslips(m: Membership, runId: string, q: PageDto) {
    return this.db.$transaction(async (tx) => {
      const run = await this.run(tx, m, runId);
      if (!['PUBLISHED', 'PAID'].includes(run.status))
        fail(
          'PAYSLIPS_NOT_PUBLISHED',
          'Payslips are available after publication.',
          409,
        );
      if (!privileged(m, ['OWNER', 'HR', 'FINANCE']) && !m.employeeId)
        return paginated([], 0, q);
      const where = {
        companyId: m.companyId,
        runId,
        ...(!privileged(m, ['OWNER', 'HR', 'FINANCE']) && m.employeeId
          ? { employeeId: m.employeeId }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.payrollEmployee.findMany({
          where,
          include: { employee: true },
          orderBy: { employee: { employeeNo: 'asc' } },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        tx.payrollEmployee.count({ where }),
      ]);
      return paginated(
        rows.map((row) => this.payslipData(row, run)),
        total,
        q,
      );
    });
  }

  async payslip(m: Membership, runId: string, employeeId: string) {
    this.canReadPayslip(m, employeeId);
    const result = await this.db.$transaction(async (tx) => {
      const run = await this.run(tx, m, runId);
      if (!['PUBLISHED', 'PAID'].includes(run.status))
        fail(
          'PAYSLIPS_NOT_PUBLISHED',
          'Payslips are available after publication.',
          409,
        );
      const row = await tx.payrollEmployee.findUnique({
        where: {
          companyId_runId_employeeId: {
            companyId: m.companyId,
            runId,
            employeeId,
          },
        },
        include: { employee: true },
      });
      if (!row) throw new NotFoundException();
      return { data: this.payslipData(row, run) };
    });
    return result;
  }
}
