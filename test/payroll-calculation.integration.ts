import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Membership, PrismaClient } from '@prisma/client';
import { Database } from '../src/database.module';
import { PayrollService } from '../src/payroll/payroll.service';
import { ComponentDefinitionsService } from '../src/payroll/component-definitions.service';
import { TaxOpeningsService } from '../src/payroll/tax-openings.service';
import { TaxFamilyService } from '../src/payroll/tax-family.service';
import { TaxExpensesService } from '../src/payroll/tax-expenses.service';
import { InputPreviewService } from '../src/payroll/input-preview.service';
import { CalculationPreviewService } from '../src/payroll/calculation-preview.service';
import { CommissionAllocationService } from '../src/payroll/commission-allocation.service';
import { OvertimeAllocationService } from '../src/payroll/overtime-allocation.service';
import { PayrollExecutionService } from '../src/payroll/payroll-execution.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { StatutoryExportService } from '../src/payroll/statutory-export.service';
import { ReportsService } from '../src/reports/reports.service';
import { PayrollAdjustmentsService } from '../src/payroll/payroll-adjustments.service';

export async function verifyPayrollCalculation(
  db: PrismaClient,
  owner: Membership,
) {
  const company = await db.company.create({
    data: { name: 'Calculation integration' },
  });
  const actor = { ...owner, companyId: company.id };
  const database = db as Database;
  const payroll = new PayrollService(database);
  const settingsBody = {
    currency: 'MYR',
    payrollCutoffDay: 'LAST_DAY' as const,
    scheduledPayDate: 1,
    standardWorkingHoursPerDay: 8,
    normalWorkingDayMultiplier: 1.5,
    restDayEarningCode: '',
    publicHolidayEarningCode: '',
  };
  assert.equal((await payroll.settings(actor)).data, null);
  const savedSettings = (await payroll.saveSettings(actor, settingsBody)).data!;
  assert.equal(savedSettings.payrollCutoffDay, 'LAST_DAY');
  assert.equal(savedSettings.scheduledPayDate, 1);
  assert.equal(savedSettings.cutoffDay, 31);
  assert.equal(savedSettings.payDay, 1);
  assert.equal(savedSettings.normalWorkingDayMultiplier, 1.5);
  assert.equal(savedSettings.restDayOvertimeMultiplier, 2);
  assert.equal(savedSettings.publicHolidayOvertimeMultiplier, 3);
  assert.equal(savedSettings.standardWorkingHoursPerDay, 8);
  await payroll.saveSettings(actor, {
    ...settingsBody,
    payrollCutoffDay: 15,
    normalWorkingDayMultiplier: null,
  });
  const reloadedSettings = (await payroll.settings(actor)).data!;
  assert.equal(reloadedSettings.payrollCutoffDay, 15);
  assert.equal(reloadedSettings.normalWorkingDayMultiplier, null);
  await assert.rejects(
    () =>
      payroll.saveSettings(actor, { ...settingsBody, scheduledPayDate: 32 }),
    { status: 400 },
  );
  console.log('PASS payroll settings FE types and nullable rates');
  const inputs = new InputPreviewService(database);
  const service = new CalculationPreviewService(database, inputs);
  const run = (await payroll.create(actor, { year: 2026, month: 1 })).data;
  const employee = await db.employee.create({
    data: {
      companyId: company.id,
      employeeNo: 'CALCULATION',
      name: 'Calculation fixture',
      joinedDate: new Date('2026-01-01'),
      salaries: {
        create: { amount: '5500', effectiveFrom: new Date('2026-01-01') },
      },
    },
  });
  const employeeUser = await db.user.create({
    data: {
      email: 'calculation-notifications@example.test',
      fullName: 'Calculation fixture user',
      passwordHash: 'integration-only',
    },
  });
  await db.membership.create({
    data: {
      companyId: company.id,
      userId: employeeUser.id,
      employeeId: employee.id,
      roles: ['EMPLOYEE'],
    },
  });
  await new ComponentDefinitionsService(database).save(actor, {
    code: 'BASIC',
    name: 'Basic salary',
    kind: 'EARNING',
    active: true,
    affectsGross: true,
    affectsNet: true,
    effectiveFrom: '2026-01-01',
    statutoryBases: ['EPF', 'PCB'],
    pcbTreatment: 'NORMAL',
    reason: 'Test setup',
  });
  await payroll.saveProfile(actor, employee.id, {
    effectiveFrom: '2026-01-01',
    reason: 'Reviewed fixture',
    epfCategory: 'TEST',
    socsoCategory: 'TEST',
    eisCategory: 'TEST',
    hrdCategory: 'TEST',
    lindungCategory: 'TEST',
    pcbCategory: 'RESIDENT',
    lindungParticipation: 'NOT_ELIGIBLE',
  });
  for (const scheme of [
    'EPF',
    'SOCSO',
    'EIS',
    'HRD',
    'LINDUNG_24_JAM',
  ] as const) {
    await db.statutoryRuleset.create({
      data: {
        companyId: company.id,
        scheme,
        category: 'TEST',
        version: 'fixture',
        effectiveFrom: new Date('2026-01-01'),
        active: true,
        sourceUrl: 'https://example.test/fixture',
        sourceSha256: 'fixture',
        parameters:
          scheme === 'EPF'
            ? {
                kind: 'RATE',
                employeeRate: '0.11',
                employerRate: '0.12',
                rounding: 'CENTS',
              }
            : { kind: 'EXEMPT', reason: 'Integration fixture only' },
      },
    });
  }
  const review = {
    taxRegime: 'STANDARD' as const,
    currentZakat: '0.00',
    zakatEvidence: 'Reviewed zero fixture',
  };
  await assert.rejects(
    () => service.preview(actor, run.id, employee.id, review),
    { status: 409 },
  );
  await new TaxOpeningsService(database).save(actor, employee.id, {
    year: 2026,
    effectiveMonth: 1,
    taxableIncome: '0',
    employeeEpf: '0',
    mtd: '0',
    zakat: '0',
    reason: 'No previous employer',
    evidenceReference: 'Zero fixture',
  });
  await new TaxFamilyService(database).save(actor, employee.id, {
    year: 2026,
    effectiveMonth: 1,
    residency: 'RESIDENT',
    category: 3,
    disabledIndividual: false,
    spouseReliefEligible: false,
    disabledSpouseReliefEligible: false,
    children: [1, 2, 3].map((n) => ({
      reference: 'child-' + n,
      kind: 'STANDARD',
      share: 'FULL',
    })),
    reason: 'Source example fixture',
    evidenceReference: 'Source example fixture',
  });
  await new TaxExpensesService(database).save(actor, employee.id, {
    year: 2026,
    effectiveMonth: 1,
    amounts: {},
    reason: 'No expenses',
    evidenceReference: 'Zero fixture',
  });
  const result = (await service.preview(actor, run.id, employee.id, review))
    .data;
  assert.equal(result.pcb.amount, '110.00');
  assert.equal(result.totals.gross, '5500.00');
  assert.equal(result.totals.deductions, '715.00');
  assert.equal(result.totals.net, '4785.00');
  assert.equal(result.totals.employerContributions, '660.00');
  assert.equal(result.taxPeriod.taxableIncome, '5500.00');
  assert.equal(result.taxPeriod.employeeEpf, '605.00');
  assert.equal(result.taxPeriod.mtd, '110.00');
  assert.equal(result.previewOnly, true);
  assert.equal(result.complete, false);
  const zakat = (
    await service.preview(actor, run.id, employee.id, {
      ...review,
      currentZakat: '10',
      zakatEvidence: 'Reviewed outside-payroll payment',
    })
  ).data;
  assert.equal(zakat.pcb.amount, '100.00');
  assert.equal(zakat.totals.net, '4795.00');
  assert.equal(zakat.taxPeriod.zakat, '10.00');
  assert.equal(await db.payrollEmployee.count({ where: { runId: run.id } }), 0);
  assert.equal(
    (await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status,
    'DRAFT',
  );
  await assert.rejects(
    () => service.preview(owner, run.id, employee.id, review),
    { status: 404 },
  );
  await assert.rejects(
    () =>
      service.preview(actor, run.id, employee.id, {
        ...review,
        zakatEvidence: ' ',
      }),
    { status: 400 },
  );
  const commissions = new CommissionAllocationService(database);
  await new ComponentDefinitionsService(database).save(actor, {
    code: 'COMM',
    name: 'Commission',
    kind: 'EARNING',
    active: true,
    affectsGross: true,
    affectsNet: true,
    effectiveFrom: '2026-01-01',
    statutoryBases: ['EPF', 'PCB'],
    pcbTreatment: 'ADDITIONAL',
    reason: 'Reviewed commission definition',
  });
  const record = await db.commissionPayrollRecord.create({
    data: {
      companyId: company.id,
      employeeId: employee.id,
      planCode: 'SALES',
      planName: 'Saved sales plan',
      payrollEarningCode: 'COMM',
      amount: '200',
      status: 'READY_FOR_PAYROLL',
      payoutTiming: 'CURRENT_PAYROLL',
      createdDate: new Date('2026-01-01'),
    },
  });
  const reason = { reason: 'Reviewed payout' };
  await commissions.change(actor, run.id, record.id, reason, true);
  await commissions.change(actor, run.id, record.id, reason, true);
  assert.equal(
    (await commissions.history(actor, record.id, { page: 1, pageSize: 20 }))
      .meta.total,
    1,
  );
  const withCommission = (
    await service.preview(actor, run.id, employee.id, review)
  ).data;
  assert.equal(withCommission.totals.gross, '5700.00');
  assert.equal(withCommission.input.commissionSources[0].amount, '200.00');
  assert.equal(withCommission.taxPeriod.employeeEpf, '627.00');
  assert.equal(
    (
      await db.commissionPayrollRecord.findUniqueOrThrow({
        where: { id: record.id },
      })
    ).status,
    'READY_FOR_PAYROLL',
  );
  await assert.rejects(
    () => commissions.change(owner, run.id, record.id, reason, true),
    { status: 404 },
  );
  await commissions.change(
    actor,
    run.id,
    record.id,
    { reason: 'Reassign' },
    false,
  );
  await commissions.change(
    actor,
    run.id,
    record.id,
    { reason: 'Retry release' },
    false,
  );
  assert.equal(
    (await commissions.history(actor, record.id, { page: 1, pageSize: 20 }))
      .meta.total,
    2,
  );
  assert.equal(
    (await service.preview(actor, run.id, employee.id, review)).data.totals
      .gross,
    '5500.00',
  );
  const nextRun = (await payroll.create(actor, { year: 2026, month: 2 })).data;
  await db.commissionPayrollRecord.update({
    where: { id: record.id },
    data: { payoutTiming: 'NEXT_PAYROLL' },
  });
  await assert.rejects(() =>
    commissions.change(actor, run.id, record.id, reason, true),
  );
  await commissions.change(actor, nextRun.id, record.id, reason, true);
  await assert.rejects(
    () => commissions.change(actor, run.id, record.id, reason, false),
    { status: 409 },
  );
  await commissions.change(actor, nextRun.id, record.id, reason, false);
  await db.commissionPayrollRecord.update({
    where: { id: record.id },
    data: { payoutTiming: 'SEPARATE_PAYOUT' },
  });
  await assert.rejects(() =>
    commissions.change(actor, nextRun.id, record.id, reason, true),
  );
  await db.commissionPayrollRecord.update({
    where: { id: record.id },
    data: { payoutTiming: 'CURRENT_PAYROLL' },
  });
  const allocationRace = await Promise.allSettled([
    commissions.change(actor, run.id, record.id, reason, true),
    commissions.change(actor, nextRun.id, record.id, reason, true),
  ]);
  assert.equal(
    allocationRace.filter((r) => r.status === 'fulfilled').length,
    1,
  );
  const allocated = await db.commissionPayrollRecord.findUniqueOrThrow({
    where: { id: record.id },
  });
  await new ComponentDefinitionsService(database).save(actor, {
    code: 'OT',
    name: 'Overtime',
    kind: 'EARNING',
    active: true,
    affectsGross: true,
    affectsNet: true,
    effectiveFrom: '2026-01-01',
    statutoryBases: ['EPF', 'PCB'],
    pcbTreatment: 'ADDITIONAL',
    reason: 'Reviewed overtime definition',
  });
  await db.employee.update({
    where: { id: employee.id },
    data: {
      includeOvertime: true,
      overtimeCalculationBasis: 'HOURLY_RATE',
      overtimeHourlyRate: '20',
    },
  });
  const overtime = await db.overtimeRequest.create({
    data: {
      companyId: company.id,
      employeeId: employee.id,
      requestDate: new Date('2026-01-05'),
      overtimeDate: new Date('2026-01-03'),
      overtimeType: 'NORMAL_WORKING_DAY',
      startTime: '18:00',
      endTime: '21:00',
      totalMinutes: 180,
      breakDurationMinutes: 30,
      netMinutes: 150,
      hourlyRateMultiplier: '1.5',
      earningCode: 'OT',
      description: 'Reviewed overtime fixture',
      status: 'APPROVED',
      decidedBy: owner.userId,
      decidedAt: new Date('2026-01-06'),
    },
  });
  const overtimeAllocation = new OvertimeAllocationService(database);
  await overtimeAllocation.change(actor, run.id, overtime.id, reason, true);
  await overtimeAllocation.change(actor, run.id, overtime.id, reason, true);
  assert.equal(
    (
      await overtimeAllocation.history(actor, overtime.id, {
        page: 1,
        pageSize: 20,
      })
    ).meta.total,
    1,
  );
  const withOvertime = (
    await service.preview(actor, run.id, employee.id, review)
  ).data;
  assert.equal(
    withOvertime.totals.gross,
    allocated.payrollRunId === run.id ? '5775.00' : '5575.00',
  );
  assert.equal(withOvertime.input.overtimeSources[0].amount, '75.00');
  await overtimeAllocation.change(
    actor,
    run.id,
    overtime.id,
    { reason: 'Remove for final fixture' },
    false,
  );
  assert.equal(
    (await service.preview(actor, run.id, employee.id, review)).data.totals
      .gross,
    allocated.payrollRunId === run.id ? '5700.00' : '5500.00',
  );
  console.log(
    'PASS approved overtime allocation, idempotency, hourly calculation, source trace and release',
  );
  await db.payrollRun.update({
    where: { id: allocated.payrollRunId! },
    data: { status: 'CALCULATED' },
  });
  await assert.rejects(
    () =>
      commissions.change(
        actor,
        allocated.payrollRunId!,
        record.id,
        reason,
        false,
      ),
    { status: 409 },
  );
  console.log(
    'PASS commission payroll allocation, history/idempotency, payout timing, source amounts, concurrency and period locks',
  );
  await db.payrollRun.update({
    where: { id: run.id },
    data: { status: 'DRAFT' },
  });
  await db.employee.update({
    where: { id: employee.id },
    data: { bank: 'MAYBANK', bankAccount: '1234567890' },
  });
  await db.payslipSettings.create({
    data: {
      companyId: company.id,
      bankAccountDetails: true,
      maskBankAccountNumber: true,
      displayFooterMessage: true,
      footerText: 'Prepared by Payroll',
    },
  });
  const expectedGross = Number(
    (await service.preview(actor, run.id, employee.id, review)).data.totals
      .gross,
  );
  const execution = new PayrollExecutionService(database, service);
  const calculated = await execution.calculate(actor, run.id, review);
  assert.equal(calculated.data.status, 'CALCULATED');
  assert.equal(await db.payrollEmployee.count({ where: { runId: run.id } }), 1);
  const register = await execution.register(actor, run.id, {
    page: 1,
    pageSize: 20,
    search: 'CALCULATION',
  });
  assert.equal(register.meta.total, 1);
  assert.equal(register.data[0].employeeNo, 'CALCULATION');
  assert.equal(register.data[0].grossPay, expectedGross);
  const reopened = await execution.reopen(actor, run.id, {
    reason: 'Corrected reviewed payroll inputs before approval',
  });
  assert.equal(reopened.data.status, 'DRAFT');
  assert.equal(await db.payrollEmployee.count({ where: { runId: run.id } }), 0);
  const reopenAudit = await db.auditEvent.findFirst({
    where: {
      companyId: company.id,
      action: 'PAYROLL_REOPENED',
      resourceId: run.id,
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.deepEqual(reopenAudit?.metadata, {
    reason: 'Corrected reviewed payroll inputs before approval',
  });
  const recalculated = await execution.calculate(actor, run.id, review);
  assert.equal(recalculated.data.status, 'CALCULATED');
  assert.equal(await db.payrollEmployee.count({ where: { runId: run.id } }), 1);
  const approved = await execution.approve(actor, run.id);
  assert.equal(approved.data.status, 'APPROVED');
  const published = await execution.publish(actor, run.id);
  assert.equal(published.data.status, 'PUBLISHED');
  const employeeMember = {
    companyId: company.id,
    userId: employeeUser.id,
    employeeId: employee.id,
    roles: ['EMPLOYEE'],
  } as Membership;
  const notifications = new NotificationsService(database);
  const notificationList = await notifications.list(employeeMember, {
    page: 1,
    pageSize: 20,
    unreadOnly: true,
  });
  assert.equal(notificationList.meta.total, 1);
  assert.equal(notificationList.meta.unreadCount, 1);
  assert.equal(notificationList.data[0].kind, 'PAYSLIP_PUBLISHED');
  await notifications.read(employeeMember, notificationList.data[0].id);
  const payslip = (await execution.payslip(actor, run.id, employee.id)).data;
  assert.equal(payslip.status, 'Published');
  assert.equal(payslip.employee.employeeNo, 'CALCULATION');
  assert.equal(payslip.employee.bankAccount, '******7890');
  assert.equal(payslip.footerMessage, 'Prepared by Payroll');
  assert.equal(payslip.earnings.grossPay, expectedGross);
  const pdf = await execution.payslipPdf(actor, run.id, employee.id);
  assert.equal(pdf.filename, 'CALCULATION-2026-01-payslip.pdf');
  assert.equal(pdf.bytes.toString('ascii').startsWith('%PDF-1.4'), true);
  assert.equal(pdf.bytes.toString('ascii').includes('LINDUNG 24 Jam'), true);
  const publishedRow = await db.payrollEmployee.findUniqueOrThrow({
    where: {
      companyId_runId_employeeId: {
        companyId: company.id,
        runId: run.id,
        employeeId: employee.id,
      },
    },
  });
  await db.payrollEmployee.update({
    where: { id: publishedRow.id },
    data: {
      snapshot: {
        ...(publishedRow.snapshot as object),
        payslipSettings: {
          ...((publishedRow.snapshot as any).payslipSettings ?? {}),
          employeeVisibility: 'ADMINS_ONLY',
        },
      },
    },
  });
  assert.equal(
    (await execution.payslips(actor, run.id, { page: 1, pageSize: 20 })).meta
      .total,
    1,
  );
  const employeeActor = {
    ...actor,
    employeeId: employee.id,
    roles: ['EMPLOYEE'],
  } as Membership;
  await assert.rejects(
    () => execution.payslip(employeeActor, run.id, employee.id),
    { status: 404 },
  );
  assert.equal(
    (await execution.payslips(employeeActor, run.id, { page: 1, pageSize: 20 }))
      .meta.total,
    0,
  );
  const paid = await execution.pay(actor, run.id, {
    paymentReference: 'PAYROLL-2026-01',
  });
  assert.equal(paid.data.status, 'PAID');
  const statutoryExports = new StatutoryExportService(database);
  const epfExport = await statutoryExports.export(actor, run.id, 'EPF');
  assert.equal(epfExport.filename, 'epf-2026-01-review.csv');
  assert.equal(epfExport.content.includes('payroll-statutory-review-v1'), true);
  assert.equal(epfExport.content.includes('CALCULATION'), true);
  const registerExport = await execution.registerCsv(actor, run.id, {
    page: 1,
    pageSize: 20,
    search: 'CALCULATION',
  });
  assert.equal(registerExport.filename, 'payroll-register-2026-01.csv');
  assert.equal(registerExport.content.includes('Employee number'), true);
  assert.equal(registerExport.content.includes('LINDUNG 24 Jam'), true);
  const payslipHistory = await new ReportsService(database).payslipHistory(
    actor,
    { year: 2026, month: 1 },
  );
  assert.equal(payslipHistory.includes('CALCULATION'), true);
  const exportAudit = await db.auditEvent.findFirst({
    where: {
      companyId: company.id,
      action: 'STATUTORY_EXPORTED',
      resourceId: run.id,
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.deepEqual(exportAudit?.metadata, {
    scheme: 'EPF',
    schemaVersion: 'payroll-statutory-review-v1',
  });
  await assert.rejects(
    () => execution.reopen(actor, run.id, { reason: 'Too late' }),
    { status: 409 },
  );
  await assert.rejects(
    () => service.preview(actor, run.id, employee.id, review),
    { status: 409 },
  );
  const correctionRun = (await payroll.create(actor, { year: 2026, month: 3 }))
    .data;
  const adjustments = new PayrollAdjustmentsService(database);
  const correctionKey = randomUUID();
  const correction = (
    await adjustments.create(actor, correctionRun.id, {
      sourceRunId: run.id,
      employeeId: employee.id,
      idempotencyKey: correctionKey,
      componentCode: 'COMM',
      amount: '125.00',
      reason: 'Correct January commission underpayment',
    })
  ).data;
  assert.equal(correction.sourceRunId, run.id);
  assert.equal(correction.targetRunId, correctionRun.id);
  assert.equal(correction.amount, '125.00');
  assert.equal(
    (
      await adjustments.create(actor, correctionRun.id, {
        sourceRunId: run.id,
        employeeId: employee.id,
        idempotencyKey: correctionKey,
        componentCode: 'COMM',
        amount: '125.00',
        reason: 'Correct January commission underpayment',
      })
    ).data.id,
    correction.id,
  );
  assert.equal(
    (await adjustments.list(actor, correctionRun.id, { page: 1, pageSize: 20 }))
      .meta.total,
    1,
  );
  const voided = (
    await adjustments.void(actor, correctionRun.id, correction.id, {
      reason: 'Correction entered in error',
    })
  ).data;
  assert.equal(voided.voidReason, 'Correction entered in error');
  assert.equal(
    (await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status,
    'PAID',
  );
  await assert.rejects(
    () =>
      adjustments.create(actor, run.id, {
        sourceRunId: run.id,
        employeeId: employee.id,
        idempotencyKey: randomUUID(),
        componentCode: 'COMM',
        amount: '1.00',
        reason: 'Same-period correction',
      }),
    { status: 409 },
  );
  console.log(
    'PASS finalized payroll corrections, later-period trace, idempotency and draft-only voiding',
  );
  const dashboard = await new ReportsService(database).dashboard(actor, {
    year: 2026,
  });
  assert.ok(dashboard.data.activeEmployees >= 1);
  assert.equal(dashboard.data.latestPayroll?.runId, run.id);
  assert.equal(dashboard.data.latestPayroll?.status, 'PAID');
  assert.equal(typeof dashboard.data.latestPayroll?.gross, 'number');
  assert.equal(typeof dashboard.data.latestPayroll?.net, 'number');
  assert.ok(
    dashboard.data.payrollTrend.every(
      (row) => typeof row.gross === 'number' && typeof row.net === 'number',
    ),
  );
  assert.ok(dashboard.data.payrollTrend.some((row) => row.runId === run.id));
  console.log(
    'PASS dashboard aggregates, payroll trend, team counts and upcoming calendar data',
  );
  console.log(
    'PASS persisted payroll calculation, approval, publication, payslip mapping, payment settlement and locked reads',
  );
}
