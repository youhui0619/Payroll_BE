import 'dotenv/config';
import { PrismaClient, Membership } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { AttendanceService } from '../src/attendance/attendance.module';
import { LeaveService } from '../src/leave/leave.service';
import { ClaimsService } from '../src/claims/claims.module';
import { Database } from '../src/database.module';
import { PayrollService } from '../src/payroll/payroll.service';
import { FilesService } from '../src/files/files.module';
import { RulesService } from '../src/payroll/rules.module';
import { ComponentDefinitionsService } from '../src/payroll/component-definitions.module';
import { PayrollInputsService } from '../src/payroll/payroll-inputs.module';
import { EmployeesService } from '../src/employees/employees.module';
import { resolveUnpaidDays } from '../src/payroll/leave-inputs';
import { InputPreviewService } from '../src/payroll/input-preview.service';
import { ClaimAllocationService } from '../src/payroll/claim-allocation.module';
import { TaxOpeningsService } from '../src/payroll/tax-openings.module';
import { TaxExpensesService } from '../src/payroll/tax-expenses.module';
import {
  TaxFamilyService,
  TaxFamilyDto,
} from '../src/payroll/tax-family.module';
import {
  componentFromDefinition,
  payrollBases,
} from '../src/payroll/payroll-calculator';

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('Set DATABASE_URL to locate the PostgreSQL server.');
  const name = 'payroll_test_' + randomUUID().replace(/-/g, '');
  if (!/^payroll_test_[a-f0-9]{32}$/.test(name))
    throw new Error('Invalid disposable database name');
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = '/' + name;
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  let db: PrismaClient | undefined;
  let created = false;
  try {
    await admin.$executeRawUnsafe('CREATE DATABASE "' + name + '"');
    created = true;
    console.log('Created disposable database ' + name);
    execFileSync(
      process.execPath,
      [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: testUrl.toString() },
        stdio: 'pipe',
      },
    );
    db = new PrismaClient({ datasourceUrl: testUrl.toString() });
    const company = await db.company.create({
      data: { name: 'Integration only' },
    });
    const other = await db.company.create({ data: { name: 'Other tenant' } });
    const user = await db.user.create({
      data: {
        email: randomUUID() + '@example.test',
        passwordHash: 'not-login-enabled',
      },
    });
    const schedule = await db.workSchedule.create({
      data: {
        companyId: company.id,
        code: 'DEFAULT',
        name: 'Weekdays',
        workingDays: [1, 2, 3, 4, 5],
        startMinute: 540,
        endMinute: 1080,
        effectiveFrom: new Date('2020-01-01'),
      },
    });
    const manager = await db.employee.create({
      data: {
        companyId: company.id,
        employeeNo: 'M',
        name: 'Manager',
        joinedDate: new Date('2020-01-01'),
      },
    });
    const employee = await db.employee.create({
      data: {
        companyId: company.id,
        employeeNo: 'E',
        name: 'Employee',
        joinedDate: new Date('2020-01-01'),
        scheduleId: schedule.id,
        managerId: manager.id,
      },
    });
    const member = await db.membership.create({
      data: {
        companyId: company.id,
        userId: user.id,
        employeeId: employee.id,
        roles: ['EMPLOYEE'],
      },
    });
    const owner = {
      ...member,
      employeeId: null,
      roles: ['OWNER'],
    } as Membership;
    const rules = new RulesService(db as Database);
    const imported = await rules.importCatalog(owner, 'EIS_2024_10');
    const lindungRule = await rules.importCatalog(
      owner,
      'LINDUNG_2026_06_PHASE_ONE',
    );
    assert.equal(
      lindungRule.data.effectiveFrom.toISOString().slice(0, 10),
      '2026-06-01',
    );
    assert.equal(
      lindungRule.data.effectiveTo?.toISOString().slice(0, 10),
      '2026-12-31',
    );
    const lindungPreview = await rules.preview(
      owner,
      lindungRule.data.id,
      '6000.01',
    );
    assert.equal(lindungPreview.data.employee, '44.65');
    assert.equal(lindungPreview.data.employer, '0.00');
    assert.equal(imported.data.active, false);
    assert.equal(imported.data.companyId, company.id);
    const preview = await rules.preview(owner, imported.data.id, '6000.01');
    assert.equal(preview.data.employee, '11.90');
    assert.equal(
      (preview.data.provenance as { checksumKind: string }).checksumKind,
      'ORIGINAL_PDF',
    );
    await assert.rejects(() => rules.importCatalog(owner, 'EIS_2024_10'));
    await assert.rejects(() =>
      rules.preview({ ...owner, companyId: other.id }, imported.data.id, '100'),
    );
    const otherRule = await rules.importCatalog(
      { ...owner, companyId: other.id },
      'EIS_2024_10',
    );
    assert.notEqual(otherRule.data.id, imported.data.id);
    await rules.activate(owner, imported.data.id);
    await assert.rejects(() =>
      rules.retire({ ...owner, companyId: other.id }, imported.data.id),
    );
    const retired = await rules.retire(owner, imported.data.id);
    assert.equal(retired.data.active, false);
    assert.equal(
      (await rules.preview(owner, imported.data.id, '6000')).data.employee,
      '11.90',
    );
    await rules.activate(owner, imported.data.id);
    const partF = await rules.importCatalog(owner, 'EPF_2025_10_PART_F');
    const partFPreview = (await rules.preview(owner, partF.data.id, '6710'))
      .data;
    assert.equal(partFPreview.total, '269.00');
    assert.equal(partFPreview.remittanceRounding, '0.60');
    assert.equal(
      (
        await db.statutoryRuleset.findUniqueOrThrow({
          where: { id: imported.data.id },
        })
      ).active,
      true,
    );
    console.log(
      'PASS catalog draft import, duplicate protection, provenance and tenant isolation',
    );
    const foreign = await db.employee.create({
      data: {
        companyId: other.id,
        employeeNo: 'E',
        name: 'Foreign',
        joinedDate: new Date('2020-01-01'),
      },
    });
    await assert.rejects(() =>
      db!.salaryHistory.create({
        data: {
          companyId: company.id,
          employeeId: foreign.id,
          amount: '100',
          effectiveFrom: new Date('2026-01-01'),
        },
      }),
    );
    console.log('PASS composite tenant foreign key');
    const attendance = new AttendanceService(db as Database);
    const attempts = await Promise.allSettled([
      attendance.clock(member, randomUUID(), 'IN'),
      attendance.clock(member, randomUUID(), 'IN'),
    ]);
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      await db.attendanceSession.count({
        where: { employeeId: employee.id, clockOut: null },
      }),
      1,
    );
    const open = await db.attendanceSession.findFirstOrThrow({
      where: { employeeId: employee.id },
    });
    assert.equal(
      (await attendance.clock(member, open.clockInKey, 'IN')).data.id,
      open.id,
    );
    const outKey = randomUUID();
    await attendance.clock(member, outKey, 'OUT');
    await attendance.clock(member, outKey, 'OUT');
    assert.equal(
      await db.attendanceSession.count({
        where: { employeeId: employee.id, clockOut: null },
      }),
      0,
    );
    console.log('PASS concurrent clocking and idempotency');
    const leave = new LeaveService(db as Database);
    const policy = (
      await leave.createPolicy(owner, {
        code: 'AL',
        name: 'Annual',
        paid: true,
        annualDays: '14',
        allowHalfDay: true,
        noticeDays: 0,
        approval: 'HR_ONLY',
        effectiveFrom: '2020-01-01',
      })
    ).data;
    const grant = {
      employeeId: employee.id,
      policyId: policy.id,
      year: 2099,
      days: '14',
      reason: 'Test',
      idempotencyKey: randomUUID(),
    };
    await leave.grant(owner, grant);
    await leave.grant(owner, grant);
    const day = new Date('2099-01-05');
    while (![1, 2, 3, 4, 5].includes(day.getUTCDay()))
      day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    const application = (
      await leave.create(member, {
        policyId: policy.id,
        startDate: date,
        endDate: date,
        halfDay: false,
        reason: 'Test',
      })
    ).data;
    await leave.edit(member, application.id, {
      policyId: policy.id,
      startDate: date,
      endDate: date,
      halfDay: true,
      reason: 'Half day instead',
    });
    await leave.submit(member, application.id);
    const reservedBalance = (
      await leave.balance(member, { year: 2099 })
    ).data.find((row) => row.policyId === policy.id);
    assert.equal(reservedBalance?.balance, '14.00');
    assert.equal(reservedBalance?.reserved, '0.50');
    assert.equal(reservedBalance?.available, '13.50');
    await assert.rejects(() =>
      leave.edit(member, application.id, {
        policyId: policy.id,
        startDate: date,
        endDate: date,
        halfDay: false,
        reason: 'Cannot edit submitted',
      }),
    );
    const decisions = await Promise.allSettled([
      leave.decide(owner, application.id, { decision: 'APPROVE' }),
      leave.decide(owner, application.id, { decision: 'APPROVE' }),
    ]);
    assert.equal(decisions.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      await db.leaveLedger.count({
        where: { requestId: application.id, kind: 'USAGE' },
      }),
      1,
    );
    const approvedBalance = (
      await leave.balance(member, { year: 2099 })
    ).data.find((row) => row.policyId === policy.id);
    assert.equal(approvedBalance?.balance, '13.50');
    assert.equal(approvedBalance?.reserved, '0.00');
    await leave.cancel(member, application.id);
    const restored = (
      await leave.balance(owner, { year: 2099 }, employee.id)
    ).data.find((row) => row.policyId === policy.id);
    assert.equal(restored?.available, '14.00');
    const leaveHistory = (await leave.detail(member, application.id)).data
      .events;
    assert.equal(leaveHistory.length, 5);
    assert.equal(
      leaveHistory.filter((event) => event.action === 'LEAVE_APPROVE').length,
      1,
    );
    await assert.rejects(() =>
      leave.detail({ ...member, companyId: other.id }, application.id),
    );
    await assert.rejects(() =>
      leave.balance(
        { ...member, employeeId: manager.id },
        { year: 2099 },
        employee.id,
      ),
    );
    const noGrant = (await leave.balance(member, { year: 2100 })).data.find(
      (row) => row.policyId === policy.id,
    );
    assert.equal(noGrant?.available, '0.00');
    const unpaidPolicy = (
      await leave.createPolicy(owner, {
        code: 'UL',
        name: 'Unpaid',
        paid: false,
        annualDays: '0',
        allowHalfDay: false,
        noticeDays: 0,
        approval: 'MANAGER_HR',
        effectiveFrom: '2020-01-01',
      })
    ).data;
    const unpaid = (
      await leave.create(member, {
        policyId: unpaidPolicy.id,
        startDate: date,
        endDate: date,
        halfDay: false,
        reason: 'Unpaid test',
      })
    ).data;
    await leave.submit(member, unpaid.id);
    await leave.decide({ ...member, employeeId: manager.id }, unpaid.id, {
      decision: 'APPROVE',
      comment: 'Manager accepted',
    });
    await leave.decide(owner, unpaid.id, {
      decision: 'APPROVE',
      comment: 'HR accepted',
    });
    const steps = (await leave.detail(member, unpaid.id)).data.events;
    const frozenLeave = await db.leaveRequest.findUniqueOrThrow({
      where: { id: unpaid.id },
    });
    const frozenSnapshot = frozenLeave.daySnapshot as {
      scheduleId: string;
      dates: { date: string; days: string }[];
    };
    assert.deepEqual(frozenSnapshot.dates, [{ date, days: '1' }]);
    const originalSchedule = await db.workSchedule.findUniqueOrThrow({
      where: { id: frozenSnapshot.scheduleId },
    });
    await db.workSchedule.update({
      where: { id: originalSchedule.id },
      data: { workingDays: [] },
    });
    const leaveMonth = new Date(date + 'T00:00:00.000Z');
    const resolvedLeave = resolveUnpaidDays(
      [frozenLeave],
      new Date(
        Date.UTC(leaveMonth.getUTCFullYear(), leaveMonth.getUTCMonth(), 1),
      ),
      new Date(
        Date.UTC(leaveMonth.getUTCFullYear(), leaveMonth.getUTCMonth() + 1, 1),
      ),
    );
    assert.deepEqual(resolvedLeave, [{ date, days: '1', sourceId: unpaid.id }]);
    await db.workSchedule.update({
      where: { id: originalSchedule.id },
      data: { workingDays: originalSchedule.workingDays },
    });
    assert.ok(steps.some((event) => event.comment === 'Manager accepted'));
    assert.ok(steps.some((event) => event.comment === 'HR accepted'));
    assert.equal(
      (await leave.balance(member, { year: 2099 })).data.find(
        (row) => row.policyId === unpaidPolicy.id,
      )?.available,
      null,
    );
    await leave.cancel(member, unpaid.id);
    console.log(
      'PASS leave draft edits, balance reservations, retained decisions and tenant access',
    );
    const balance = await db.leaveLedger.aggregate({
      where: { employeeId: employee.id },
      _sum: { days: true },
    });
    assert.equal(balance._sum.days?.toString(), '14');
    console.log(
      'PASS ledger grants, concurrent approval, cancellation reversal',
    );
    const claims = new ClaimsService(db as Database);
    const type = (
      await claims.createType(owner, { code: 'TRAVEL', name: 'Travel' })
    ).data;
    const claim = (
      await claims.create(member, {
        typeId: type.id,
        date: '2026-01-01',
        amount: '50.25',
        description: 'Test',
        paymentMethod: 'BANK_TRANSFER',
      })
    ).data;
    await claims.submit(member, claim.id);
    await claims.decide(owner, claim.id, { decision: 'APPROVE' });
    await claims.decide(owner, claim.id, { decision: 'APPROVE' });
    const payments = await Promise.allSettled([
      claims.pay(owner, claim.id, {
        paymentDate: '2026-01-02',
        paymentReference: 'REF',
      }),
      claims.pay(owner, claim.id, {
        paymentDate: '2026-01-02',
        paymentReference: 'REF',
      }),
    ]);
    assert.equal(payments.filter((r) => r.status === 'fulfilled').length, 1);
    console.log('PASS manager/finance workflow and single payment');
    const events = await db.claimEvent.findMany({
      where: { companyId: company.id, claimId: claim.id },
    });
    assert.equal(events.length, 5);
    assert.equal(
      events.filter((event) => event.action === 'CLAIM_PAID').length,
      1,
    );
    const files = new FilesService(db as Database, {} as never, {} as never);
    const limited = (
      await claims.createType(owner, {
        code: 'RECEIPT',
        name: 'Receipt required',
        receiptRequired: true,
        maxAmount: '100.00',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      })
    ).data;
    const input = {
      typeId: limited.id,
      date: '2026-03-01',
      amount: '90.00',
      description: 'Receipt test',
      paymentMethod: 'BANK_TRANSFER',
    };
    const draft = (await claims.create(member, input)).data;
    await assert.rejects(() => claims.submit(member, draft.id));
    await assert.rejects(() =>
      claims.edit(member, draft.id, { ...input, amount: '100.01' }),
    );
    await claims.edit(member, draft.id, { ...input, amount: '100.00' });
    const receipt = await db.storedFile.create({
      data: {
        companyId: company.id,
        employeeId: employee.id,
        uploadedBy: user.id,
        originalName: 'receipt.pdf',
        mimeType: 'application/pdf',
        size: 100,
        sha256: '0'.repeat(64),
        category: 'CLAIM_RECEIPT',
        claimId: draft.id,
        scanStatus: 'CLEAN',
      },
    });
    const submitted = (await claims.submit(member, draft.id)).data;
    assert.equal(submitted.managerId, manager.id);
    await assert.rejects(() => files.archive(member, receipt.id));
    await assert.rejects(() => claims.edit(member, draft.id, input));
    await claims.updateType(owner, limited.id, {
      code: 'RECEIPT',
      name: 'Changed later',
      receiptRequired: false,
      maxAmount: '1.00',
      active: false,
    });
    const detail = (await claims.detail(member, draft.id)).data;
    assert.equal(
      (detail.policySnapshot as { maxAmount: string }).maxAmount,
      '100.00',
    );
    await claims.decide({ ...member, employeeId: manager.id }, draft.id, {
      decision: 'APPROVE',
      comment: 'Manager reviewed',
    });
    await claims.decide(owner, draft.id, {
      decision: 'REJECT',
      comment: 'Finance rejected',
    });
    const history = (await claims.detail(member, draft.id)).data.events;
    assert.ok(history.some((event) => event.comment === 'Manager reviewed'));
    assert.ok(history.some((event) => event.comment === 'Finance rejected'));
    await assert.rejects(() =>
      claims.detail({ ...member, companyId: other.id }, draft.id),
    );
    const privateDoc = await db.storedFile.create({
      data: {
        companyId: company.id,
        employeeId: employee.id,
        uploadedBy: user.id,
        originalName: 'personal.pdf',
        mimeType: 'application/pdf',
        size: 100,
        sha256: '1'.repeat(64),
        category: 'EMPLOYEE_DOCUMENT',
        scanStatus: 'CLEAN',
      },
    });
    const finance = { ...owner, roles: ['FINANCE'] } as Membership;
    const financeFiles = await files.list(finance, {
      page: 1,
      pageSize: 100,
      employeeId: employee.id,
    });
    assert.ok(financeFiles.data.some((file) => file.id === receipt.id));
    assert.ok(!financeFiles.data.some((file) => file.id === privateDoc.id));
    await assert.rejects(() => files.archive(finance, privateDoc.id));
    await files.archive(member, privateDoc.id);
    await assert.rejects(() => files.authorized(member, privateDoc.id));
    const race = (await claims.create(member, { ...input, typeId: type.id }))
      .data;
    await claims.updateType(owner, type.id, {
      code: 'TRAVEL',
      name: 'Travel',
      receiptRequired: true,
    });
    const racingReceipt = await db.storedFile.create({
      data: {
        companyId: company.id,
        employeeId: employee.id,
        uploadedBy: user.id,
        originalName: 'race.pdf',
        mimeType: 'application/pdf',
        size: 100,
        sha256: '2'.repeat(64),
        category: 'CLAIM_RECEIPT',
        claimId: race.id,
        scanStatus: 'CLEAN',
      },
    });
    await Promise.allSettled([
      claims.submit(member, race.id),
      files.archive(member, racingReceipt.id),
    ]);
    const raceResult = await db.claim.findUniqueOrThrow({
      where: { id: race.id },
    });
    if (raceResult.status === 'PENDING_MANAGER')
      assert.equal(
        (
          await db.storedFile.findUniqueOrThrow({
            where: { id: racingReceipt.id },
          })
        ).archived,
        false,
      );
    else assert.equal(raceResult.status, 'DRAFT');
    console.log(
      'PASS receipt requirements, limits, frozen policies, decision history, file access and archive/submit race',
    );
    assert.equal(
      (
        await claims.list(
          member,
          { page: 1, pageSize: 20, employeeId: foreign.id },
          'own',
        )
      ).data.length,
      0,
    );
    const filtered = await claims.list(
      member,
      {
        page: 1,
        pageSize: 20,
        status: 'REJECTED',
        from: '2026-03-01',
        to: '2026-03-01',
        typeId: limited.id,
      },
      'own',
    );
    assert.equal(filtered.data.length, 1);
    assert.equal(filtered.data[0].id, draft.id);
    assert.equal(
      (
        await files.list(
          { ...member, employeeId: null },
          { page: 1, pageSize: 20 },
        )
      ).data.length,
      0,
    );
    await assert.rejects(() =>
      claims.cancel({ ...member, companyId: other.id }, claim.id),
    );
    const queueType = (
      await claims.createType(owner, { code: 'QUEUE', name: 'Queue test' })
    ).data;
    const queueClaim = (
      await claims.create(member, { ...input, typeId: queueType.id })
    ).data;
    await claims.submit(member, queueClaim.id);
    const queueLeave = (
      await leave.create(member, {
        policyId: policy.id,
        startDate: date,
        endDate: date,
        halfDay: false,
        reason: 'Queue test',
      })
    ).data;
    await leave.submit(member, queueLeave.id);
    assert.ok(
      (await claims.list(owner, { page: 1, pageSize: 20 }, 'pending')).data
        .length > 0,
    );
    assert.ok(
      (await leave.pending(owner, { page: 1, pageSize: 20 })).data.length > 0,
    );
    assert.equal(
      (
        await claims.list(
          { ...member, employeeId: null },
          { page: 1, pageSize: 20 },
          'pending',
        )
      ).data.length,
      0,
    );
    assert.equal(
      (
        await leave.pending(
          { ...member, employeeId: null },
          { page: 1, pageSize: 20 },
        )
      ).data.length,
      0,
    );
    console.log('PASS unlinked-member file and approval-queue isolation');
    console.log('PASS cross-company request isolation');
    const payroll = new PayrollService(db as Database);
    const taxFamilies = new TaxFamilyService(db as Database);
    const taxExpenses = new TaxExpensesService(db as Database);
    const expenses = {
      year: 2026,
      effectiveMonth: 6,
      amounts: { C5: '3000' },
      evidenceReference: 'Reviewed TP1 receipts',
      reason: 'Initial reviewed totals',
    };
    const expenses1 = (await taxExpenses.save(owner, employee.id, expenses))
      .data;
    assert.equal((expenses1.amounts as Record<string, string>).C5, '3000.00');
    assert.equal((expenses1.amounts as Record<string, string>).C1AB, '0.00');
    const expenses2 = (
      await taxExpenses.save(owner, employee.id, {
        ...expenses,
        amounts: { C5: '2000' },
        reason: 'Correction',
      })
    ).data;
    assert.equal(expenses2.revision, 2);
    assert.equal((expenses2.amounts as Record<string, string>).C5, '2000.00');
    await assert.rejects(() =>
      taxExpenses.save(owner, employee.id, { ...expenses, effectiveMonth: 5 }),
    );
    await assert.rejects(() =>
      taxExpenses.save(owner, employee.id, {
        ...expenses,
        amounts: { UNKNOWN: '1' } as never,
      }),
    );
    assert.equal(
      (
        await taxExpenses.history(owner, employee.id, {
          year: 2026,
          page: 1,
          pageSize: 20,
        })
      ).meta.total,
      2,
    );
    await assert.rejects(() =>
      taxExpenses.history({ ...owner, companyId: other.id }, employee.id, {
        year: 2026,
        page: 1,
        pageSize: 20,
      }),
    );
    const family: TaxFamilyDto = {
      year: 2026,
      effectiveMonth: 6,
      residency: 'RESIDENT',
      category: 2,
      disabledIndividual: false,
      spouseReliefEligible: true,
      disabledSpouseReliefEligible: false,
      children: [{ reference: 'child-1', kind: 'STANDARD', share: 'FULL' }],
      evidenceReference: 'Reviewed family declaration',
      reason: 'Initial review',
    };
    const family1 = (await taxFamilies.save(owner, employee.id, family)).data;
    assert.equal(
      (family1.reliefs as { familyReliefs: string }).familyReliefs,
      '15000.00',
    );
    await taxFamilies.save(owner, employee.id, {
      ...family,
      children: [],
      reason: 'Corrected child declaration',
    });
    assert.equal(
      (
        await taxFamilies.history(owner, employee.id, {
          year: 2026,
          page: 1,
          pageSize: 20,
        })
      ).meta.total,
      2,
    );
    await assert.rejects(() =>
      taxFamilies.history({ ...owner, companyId: other.id }, employee.id, {
        year: 2026,
        page: 1,
        pageSize: 20,
      }),
    );
    const definitions = new ComponentDefinitionsService(db as Database);
    const basicDefinition = {
      code: 'BASIC',
      name: 'Basic salary',
      kind: 'EARNING' as const,
      effectiveFrom: '2026-06-01',
      active: true,
      affectsGross: true,
      affectsNet: true,
      statutoryBases: ['EPF' as const],
      reason: 'Initial setup',
    };
    await definitions.save(owner, basicDefinition);
    await definitions.save(owner, {
      ...basicDefinition,
      name: 'Monthly basic salary',
      reason: 'Name correction',
    });
    await definitions.save(owner, {
      ...basicDefinition,
      effectiveFrom: '2026-07-01',
      active: false,
      reason: 'Archive from July',
    });
    await definitions.save(
      { ...owner, companyId: other.id },
      { ...basicDefinition, name: 'Other tenant salary' },
    );
    const juneDefinitions = await definitions.list(owner, {
      asOf: '2026-06-01',
      page: 1,
      pageSize: 20,
    });
    assert.equal(juneDefinitions.data.length, 1);
    assert.equal(juneDefinitions.data[0].revision, 2);
    assert.equal(juneDefinitions.data[0].name, 'Monthly basic salary');
    const configuredComponent = componentFromDefinition(
      juneDefinitions.data[0],
      '5000.00',
      { type: 'SALARY', id: 'test-salary' },
    );
    const configuredBases = payrollBases([configuredComponent]);
    assert.equal(configuredBases.bases.EPF, '5000.00');
    assert.equal(configuredBases.bases.HRD, '0.00');
    assert.equal(configuredBases.lines[0].definition?.revision, 2);
    assert.equal(
      (
        await definitions.list(owner, {
          asOf: '2026-07-01',
          page: 1,
          pageSize: 20,
        })
      ).data[0].active,
      false,
    );
    assert.equal(
      (
        await definitions.list(owner, {
          asOf: '2026-05-01',
          page: 1,
          pageSize: 20,
        })
      ).data.length,
      0,
    );
    assert.equal(
      (
        await definitions.list(owner, {
          asOf: '2026-06-01',
          search: 'missing',
          page: 1,
          pageSize: 20,
        })
      ).data.length,
      0,
    );
    assert.equal(
      (await definitions.history(owner, 'BASIC', { page: 1, pageSize: 20 }))
        .meta.total,
      3,
    );
    await assert.rejects(() => definitions.save(owner, basicDefinition));
    const initialProfile = {
      effectiveFrom: '2026-06-01',
      reason: 'Initial participation evidence',
      lindungParticipation: 'ENROLLED',
      epfCategory: 'PART_A',
      socsoCategory: 'CATEGORY_ONE',
      eisCategory: 'ELIGIBLE',
      lindungCategory: 'PHASE_ONE',
      pcbCategory: 'STANDARD',
      hrdCategory: 'EXEMPT',
    };
    const firstProfile = await payroll.saveProfile(
      owner,
      employee.id,
      initialProfile,
    );
    assert.equal(firstProfile.data.revision, 1);
    await payroll.saveProfile(owner, employee.id, {
      ...initialProfile,
      reason: 'Corrected evidence reference',
    });
    await payroll.saveProfile(owner, employee.id, {
      ...initialProfile,
      effectiveFrom: '2026-07-01',
      lindungParticipation: 'OPTED_OUT',
      reason: 'Recorded opt-out; rule still needs correction',
    });
    const profileHistory = await payroll.profileHistory(owner, employee.id, {
      page: 1,
      pageSize: 20,
    });
    assert.equal(profileHistory.meta.total, 3);
    assert.equal(profileHistory.data[2].reason, initialProfile.reason);
    assert.equal(profileHistory.data[0].lindungParticipation, 'OPTED_OUT');
    assert.equal((await payroll.profile(owner, employee.id)).data?.revision, 3);
    await assert.rejects(() =>
      payroll.profileHistory({ ...owner, companyId: other.id }, employee.id, {
        page: 1,
        pageSize: 20,
      }),
    );
    await assert.rejects(() =>
      payroll.saveProfile(owner, employee.id, initialProfile),
    );
    await rules.activate(owner, lindungRule.data.id);
    const juneRun = (await payroll.create(owner, { year: 2026, month: 6 }))
      .data;
    const julyRun = (await payroll.create(owner, { year: 2026, month: 7 }))
      .data;
    assert.equal(
      (await payroll.preflight(owner, juneRun.id)).data.issues.some(
        (i) =>
          i.employeeId === employee.id &&
          i.code === 'LINDUNG_PARTICIPATION_MISMATCH',
      ),
      false,
    );
    assert.equal(
      (await payroll.preflight(owner, julyRun.id)).data.issues.some(
        (i) =>
          i.employeeId === employee.id &&
          i.code === 'LINDUNG_PARTICIPATION_MISMATCH',
      ),
      true,
    );
    await db.payrollRun.update({
      where: { id: julyRun.id },
      data: { status: 'CALCULATED' },
    });
    await assert.rejects(() =>
      definitions.save(owner, {
        ...basicDefinition,
        effectiveFrom: '2026-07-01',
      }),
    );
    console.log(
      'PASS component definitions, month resolution, archived revisions and period locks',
    );
    await assert.rejects(() =>
      payroll.saveProfile(owner, employee.id, {
        ...initialProfile,
        effectiveFrom: '2026-07-01',
      }),
    );
    assert.equal(
      await db.employeePayrollProfileVersion.count({
        where: { employeeId: employee.id },
      }),
      3,
    );
    console.log(
      'PASS profile history, same-month corrections, period resolution, participation mismatch and payroll locks',
    );
    await payroll.saveSettings(owner, {
      cutoffDay: 25,
      payDay: 28,
      currency: 'MYR',
      makerChecker: true,
    });
    const run = (await payroll.create(owner, { year: 2099, month: 1 })).data;
    await definitions.save(owner, {
      ...basicDefinition,
      code: 'BONUS',
      effectiveFrom: '2099-01-01',
    });
    const inputs = new PayrollInputsService(db as Database);
    const manualInput = {
      employeeId: employee.id,
      componentCode: 'BONUS',
      amount: '100.00',
      reason: 'Performance bonus',
      idempotencyKey: randomUUID(),
    };
    const addedInput = (await inputs.create(owner, run.id, manualInput)).data;
    assert.equal(
      (await inputs.create(owner, run.id, { ...manualInput, amount: '100' }))
        .data.id,
      addedInput.id,
    );
    await assert.rejects(() =>
      inputs.create(owner, run.id, { ...manualInput, amount: '101' }),
    );
    await assert.rejects(() =>
      inputs.create(owner, run.id, {
        ...manualInput,
        idempotencyKey: randomUUID(),
        componentCode: 'BASIC',
      }),
    );
    await assert.rejects(() =>
      inputs.create(owner, run.id, {
        ...manualInput,
        idempotencyKey: randomUUID(),
        amount: '0',
      }),
    );
    await assert.rejects(() =>
      inputs.list({ ...owner, companyId: other.id }, run.id, {
        page: 1,
        pageSize: 20,
      }),
    );
    await inputs.void(owner, run.id, addedInput.id, {
      reason: 'Incorrect bonus',
    });
    assert.ok(
      (
        await inputs.void(owner, run.id, addedInput.id, {
          reason: 'Incorrect bonus',
        })
      ).data.voidedAt,
    );
    assert.ok((await inputs.create(owner, run.id, manualInput)).data.voidedAt);
    await assert.rejects(() =>
      inputs.void(owner, run.id, addedInput.id, { reason: 'Different reason' }),
    );
    assert.equal(
      (await inputs.list(owner, run.id, { page: 1, pageSize: 20 })).meta.total,
      1,
    );
    await db.payrollRun.update({
      where: { id: run.id },
      data: { status: 'CALCULATED' },
    });
    await assert.rejects(() =>
      new EmployeesService(db as Database).addSalary(
        owner.companyId,
        employee.id,
        { amount: '5000', effectiveFrom: '2099-01-15' },
      ),
    );
    await assert.rejects(() =>
      inputs.create(owner, run.id, {
        ...manualInput,
        idempotencyKey: randomUUID(),
      }),
    );
    await assert.rejects(() =>
      inputs.void(owner, run.id, addedInput.id, { reason: 'Incorrect bonus' }),
    );
    await db.payrollRun.update({
      where: { id: run.id },
      data: { status: 'DRAFT' },
    });
    console.log(
      'PASS payroll inputs, idempotency, void history, archived definitions, tenant isolation and period locks',
    );
    await assert.rejects(() => payroll.create(owner, { year: 2099, month: 1 }));
    await assert.rejects(() =>
      payroll.preflight({ ...owner, companyId: other.id }, run.id),
    );
    const preflight = (await payroll.preflight(owner, run.id)).data;
    assert.equal(preflight.ready, false);
    assert.ok(
      preflight.issues.some(
        (issue) => issue.code === 'SALARY_COVERAGE_MISSING',
      ),
    );
    assert.ok(
      preflight.issues.some((issue) => issue.code === 'PCB_CALCULATOR_PENDING'),
    );
    await assert.rejects(() =>
      payroll.saveProfile(owner, foreign.id, {
        effectiveFrom: '2026-10-01',
        reason: 'Tenant test',
        lindungParticipation: 'ENROLLED',
        epfCategory: 'test',
        socsoCategory: 'test',
        eisCategory: 'test',
        lindungCategory: 'test',
        pcbCategory: 'test',
        hrdCategory: 'test',
      }),
    );
    console.log(
      'PASS payroll draft uniqueness, preflight blockers and tenant isolation',
    );
    const stale = (
      await leave.create(member, {
        policyId: policy.id,
        startDate: date,
        endDate: date,
        halfDay: false,
        reason: 'Stale draft',
      })
    ).data;
    await db.leavePolicy.update({
      where: { id: policy.id },
      data: { active: false },
    });
    await assert.rejects(() => leave.submit(member, stale.id));
    assert.equal(
      (await db.leaveRequest.findUniqueOrThrow({ where: { id: stale.id } }))
        .status,
      'DRAFT',
    );
    await assert.rejects(() =>
      leave.grant(owner, {
        ...grant,
        days: '-15',
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(
      (
        await db.leaveLedger.aggregate({
          where: { employeeId: employee.id },
          _sum: { days: true },
        })
      )._sum.days?.toString(),
      '14',
    );
    console.log(
      'PASS stale draft revalidation and balance adjustment protection',
    );
    await assert.rejects(() =>
      definitions.save(owner, {
        ...basicDefinition,
        code: 'BAD_TAX',
        effectiveFrom: '2100-01-01',
        statutoryBases: ['PCB'],
      }),
    );
    const taxBonusDefinition = (
      await definitions.save(owner, {
        ...basicDefinition,
        code: 'TAX_BONUS',
        effectiveFrom: '2100-01-01',
        statutoryBases: ['PCB'],
        pcbTreatment: 'ADDITIONAL',
      })
    ).data;
    assert.equal(
      payrollBases([
        componentFromDefinition(taxBonusDefinition, '500', {
          type: 'TEST',
          id: 'taxbonus',
        }),
      ]).pcbRemuneration.additional,
      '500.00',
    );
    await assert.rejects(() =>
      db.payrollComponentDefinition.create({
        data: {
          ...taxBonusDefinition,
          id: randomUUID(),
          code: 'INVALID_TAX_DB',
          pcbTreatment: 'EXCLUDED',
        },
      }),
    );
    const assemblyRun = (await payroll.create(owner, { year: 2100, month: 1 }))
      .data;
    await definitions.save(owner, {
      ...basicDefinition,
      effectiveFrom: '2100-01-01',
    });
    const assemblyEmployee = await db.employee.create({
      data: {
        companyId: owner.companyId,
        employeeNo: 'ASSEMBLY',
        name: 'Assembly test',
        joinedDate: new Date('2100-01-01'),
        salaries: {
          create: {
            amount: '3100',
            effectiveFrom: new Date('2100-01-01'),
          },
        },
      },
    });
    const previewService = new InputPreviewService(db as Database);
    const taxOpenings = new TaxOpeningsService(db as Database);
    const opening = {
      year: 2100,
      effectiveMonth: 1,
      taxableIncome: '10000',
      employeeEpf: '1100',
      mtd: '100',
      zakat: '0',
      evidenceReference: 'Test TP3 reference',
      reason: 'Reviewed opening declaration',
    };
    const openingRevision = (
      await taxOpenings.save(owner, assemblyEmployee.id, opening)
    ).data;
    await taxOpenings.save(owner, assemblyEmployee.id, {
      ...opening,
      effectiveMonth: 2,
      taxableIncome: '12000',
      reason: 'Reviewed correction',
    });
    assert.equal(
      (
        await taxOpenings.history(owner, assemblyEmployee.id, {
          year: 2100,
          page: 1,
          pageSize: 20,
        })
      ).meta.total,
      2,
    );
    await assert.rejects(() =>
      taxOpenings.save(owner, assemblyEmployee.id, opening),
    );
    await assert.rejects(() =>
      taxOpenings.history(
        { ...owner, companyId: other.id },
        assemblyEmployee.id,
        { year: 2100, page: 1, pageSize: 20 },
      ),
    );
    await assert.rejects(() =>
      taxOpenings.save(owner, assemblyEmployee.id, {
        ...opening,
        effectiveMonth: 2,
        reason: '',
      }),
    );
    await inputs.create(owner, assemblyRun.id, {
      ...manualInput,
      employeeId: assemblyEmployee.id,
      idempotencyKey: randomUUID(),
    });
    await payroll.saveProfile(owner, assemblyEmployee.id, {
      effectiveFrom: '2100-01-01',
      reason: 'Synthetic integration profile',
      lindungParticipation: 'NOT_ELIGIBLE',
      epfCategory: 'ASSEMBLY_TEST',
      socsoCategory: 'ASSEMBLY_TEST',
      eisCategory: 'ASSEMBLY_TEST',
      lindungCategory: 'ASSEMBLY_TEST',
      pcbCategory: 'TEST',
      hrdCategory: 'ASSEMBLY_TEST',
    });
    for (const scheme of [
      'EPF',
      'SOCSO',
      'EIS',
      'LINDUNG_24_JAM',
      'HRD',
    ] as const) {
      await db.statutoryRuleset.create({
        data: {
          companyId: owner.companyId,
          scheme,
          category: 'ASSEMBLY_TEST',
          version: 'synthetic-test-only',
          effectiveFrom: new Date('2100-01-01'),
          active: true,
          sourceUrl: 'https://example.test/synthetic',
          sourceSha256: 'test',
          parameters:
            scheme === 'EPF'
              ? {
                  kind: 'RATE',
                  employeeRate: '0.02',
                  employerRate: '0.02',
                  rounding: 'TOTAL_WHOLE_UP',
                }
              : { kind: 'EXEMPT', reason: 'Synthetic integration exemption' },
        },
      });
    }
    const assembled = (
      await previewService.preview(owner, assemblyRun.id, assemblyEmployee.id)
    ).data;
    assert.equal(assembled.gross, '3200.00');
    assert.equal(assembled.bases.EPF, '3200.00');
    assert.equal(assembled.complete, false);
    assert.equal(assembled.taxOpening?.id, openingRevision.id);
    assert.equal(assembled.taxOpening?.taxableIncome.toFixed(2), '10000.00');
    assert.equal(assembled.contributionPreview.nonPcbReady, true);
    assert.equal(assembled.contributionPreview.contributions.length, 5);
    assert.equal(
      assembled.contributionPreview.contributions[0].employeeDeduction,
      '64.00',
    );
    assert.equal(assembled.lines[0].definition?.revision, 4);
    await definitions.save(owner, {
      ...basicDefinition,
      code: 'REIMBURSEMENT',
      effectiveFrom: '2100-01-01',
      affectsGross: false,
      statutoryBases: [],
    });
    const payrollClaim = await db.claim.create({
      data: {
        companyId: owner.companyId,
        employeeId: assemblyEmployee.id,
        typeId: claim.typeId,
        date: new Date('2100-01-02'),
        amount: '45',
        description: 'Reimbursement',
        status: 'APPROVED',
        paymentMethod: 'PAYROLL',
      },
    });
    const allocator = new ClaimAllocationService(db as Database);
    const allocation = { reason: 'Include approved expenses' };
    await allocator.change(
      owner,
      assemblyRun.id,
      payrollClaim.id,
      allocation,
      'REIMBURSEMENT',
    );
    await allocator.change(
      owner,
      assemblyRun.id,
      payrollClaim.id,
      allocation,
      'REIMBURSEMENT',
    );
    assert.equal(
      await db.claimEvent.count({ where: { claimId: payrollClaim.id } }),
      1,
    );
    const withClaim = (
      await previewService.preview(owner, assemblyRun.id, assemblyEmployee.id)
    ).data;
    assert.equal(withClaim.gross, '3200.00');
    assert.equal(withClaim.netBeforeStatutory, '3245.00');
    assert.equal(withClaim.claimSources[0].id, payrollClaim.id);
    const nextAssemblyRun = (
      await payroll.create(owner, { year: 2100, month: 2 })
    ).data;
    await assert.rejects(() =>
      allocator.change(
        owner,
        nextAssemblyRun.id,
        payrollClaim.id,
        allocation,
        'REIMBURSEMENT',
      ),
    );
    await assert.rejects(() =>
      allocator.change(
        { ...owner, companyId: other.id },
        assemblyRun.id,
        payrollClaim.id,
        allocation,
        'REIMBURSEMENT',
      ),
    );
    await allocator.change(owner, assemblyRun.id, payrollClaim.id, {
      reason: 'Defer expenses',
    });
    assert.equal(
      (await previewService.preview(owner, assemblyRun.id, assemblyEmployee.id))
        .data.netBeforeStatutory,
      '3200.00',
    );
    const claimRace = await Promise.allSettled([
      allocator.change(
        owner,
        assemblyRun.id,
        payrollClaim.id,
        allocation,
        'REIMBURSEMENT',
      ),
      allocator.change(
        owner,
        nextAssemblyRun.id,
        payrollClaim.id,
        allocation,
        'REIMBURSEMENT',
      ),
    ]);
    assert.equal(claimRace.filter((r) => r.status === 'fulfilled').length, 1);
    const assignedClaim = await db.claim.findUniqueOrThrow({
      where: { id: payrollClaim.id },
    });
    await db.payrollRun.update({
      where: { id: assignedClaim.payrollRunId! },
      data: { status: 'CALCULATED' },
    });
    await assert.rejects(() =>
      allocator.change(owner, assignedClaim.payrollRunId!, payrollClaim.id, {
        reason: 'Too late',
      }),
    );
    await assert.rejects(() =>
      previewService.preview(
        { ...owner, companyId: other.id },
        assemblyRun.id,
        assemblyEmployee.id,
      ),
    );
    await db.payrollRun.update({
      where: { id: assemblyRun.id },
      data: { status: 'CALCULATED' },
    });
    await assert.rejects(() =>
      previewService.preview(owner, assemblyRun.id, assemblyEmployee.id),
    );
    console.log(
      'PASS assembled salary/manual input preview, effective definition, tenant scope and draft-only access',
    );
    await db.payrollRun.update({
      where: { id: nextAssemblyRun.id },
      data: { status: 'CALCULATED' },
    });
    await assert.rejects(() =>
      taxOpenings.save(owner, assemblyEmployee.id, {
        ...opening,
        effectiveMonth: 2,
        reason: 'Locked correction',
      }),
    );
    console.log(
      'PASS tax opening revisions, month selection, tenant scope, totals validation and payroll locks',
    );
    await assert.rejects(() => taxFamilies.save(owner, employee.id, family));
    await assert.rejects(() => taxExpenses.save(owner, employee.id, expenses));
    console.log(
      'PASS reviewed family relief snapshots, corrections, tenant isolation and payroll locks',
    );
    console.log('ALL DATABASE INTEGRATION CHECKS PASSED');
  } finally {
    await db?.$disconnect();
    if (created) {
      await admin.$executeRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${name} AND pid <> pg_backend_pid()`;
      await admin.$executeRawUnsafe('DROP DATABASE "' + name + '"');
      console.log('Removed disposable database ' + name);
    }
    await admin.$disconnect();
  }
}
main().catch((error) => {
  if (error instanceof Error && error.name === 'AssertionError')
    console.error(
      error.stack
        ?.split('\n')
        .filter((line) => line.trim().startsWith('at '))
        .join('\n'),
    );
  console.error(
    'Integration checks failed:',
    error instanceof Error ? error.name : 'UnknownError',
  );
  process.exitCode = 1;
});
