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
  await db.payrollRun.update({
    where: { id: run.id },
    data: { status: 'CALCULATED' },
  });
  await assert.rejects(
    () => service.preview(actor, run.id, employee.id, review),
    { status: 409 },
  );
  console.log(
    'PASS resolved payroll calculation, source-example PCB, zakat credit, totals, tenant scope and read-only draft behavior',
  );
}
