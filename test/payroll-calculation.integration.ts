import { strict as assert } from 'node:assert';
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
  assert.equal(savedSettings.normalWorkingDayMultiplier, 1.5);
  assert.equal(savedSettings.standardWorkingHoursPerDay, 8);
  assert.equal(savedSettings.makerChecker, true);
  await payroll.saveSettings(actor, { ...settingsBody, makerChecker: false });
  await payroll.saveSettings(actor, {
    ...settingsBody,
    payrollCutoffDay: 15,
    normalWorkingDayMultiplier: null,
  });
  const reloadedSettings = (await payroll.settings(actor)).data!;
  assert.equal(reloadedSettings.payrollCutoffDay, 15);
  assert.equal(reloadedSettings.makerChecker, false);
  assert.equal(reloadedSettings.normalWorkingDayMultiplier, null);
  await assert.rejects(
    () =>
      payroll.saveSettings(actor, { ...settingsBody, scheduledPayDate: 32 }),
    { status: 400 },
  );
  console.log(
    'PASS payroll settings FE types, omitted maker-checker preservation and nullable rates',
  );
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
  assert.equal(withOvertime.totals.gross, '5775.00');
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
    '5700.00',
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
  const expectedGross = Number(
    (await service.preview(actor, run.id, employee.id, review)).data.totals
      .gross,
  );
  const execution = new PayrollExecutionService(database, service);
  const calculated = await execution.calculate(actor, run.id, review);
  assert.equal(calculated.data.status, 'CALCULATED');
  assert.equal(await db.payrollEmployee.count({ where: { runId: run.id } }), 1);
  const approved = await execution.approve(actor, run.id);
  assert.equal(approved.data.status, 'APPROVED');
  const published = await execution.publish(actor, run.id);
  assert.equal(published.data.status, 'PUBLISHED');
  const payslip = (await execution.payslip(actor, run.id, employee.id)).data;
  assert.equal(payslip.status, 'Published');
  assert.equal(payslip.employee.employeeNo, 'CALCULATION');
  assert.equal(payslip.earnings.grossPay, expectedGross);
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
  assert.equal(
    (await execution.payslips(employeeActor, run.id, { page: 1, pageSize: 20 }))
      .meta.total,
    1,
  );
  const paid = await execution.pay(actor, run.id, {
    paymentReference: 'PAYROLL-2026-01',
  });
  assert.equal(paid.data.status, 'PAID');
  await assert.rejects(
    () => service.preview(actor, run.id, employee.id, review),
    { status: 409 },
  );
  console.log(
    'PASS persisted payroll calculation, approval, publication, payslip mapping, payment settlement and locked reads',
  );
}
