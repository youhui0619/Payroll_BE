import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma, StatutoryScheme } from '@prisma/client';
import { Database } from '../database.module';
import { audit, dateOnly, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import {
  CreatePayrollDto,
  PayrollProfileDto,
  PayrollSettingsDto,
} from './payroll.dto';
import { validateRules } from './calculator';
import { calculateSalary } from './salary-calculator';
import { resolveUnpaidDays } from './leave-inputs';

export const categoryFields = {
  EPF: 'epfCategory',
  SOCSO: 'socsoCategory',
  EIS: 'eisCategory',
  LINDUNG_24_JAM: 'lindungCategory',
  PCB: 'pcbCategory',
  HRD: 'hrdCategory',
} as const;

export function payrollPeriod(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  return { start, next, end: new Date(next.getTime() - 86400000) };
}

@Injectable()
export class PayrollService {
  constructor(private db: Database) {}

  async settings(m: Membership) {
    return {
      data: await this.db.payrollSettings.findUnique({
        where: { companyId: m.companyId },
      }),
    };
  }

  async saveSettings(m: Membership, d: PayrollSettingsDto) {
    return this.db.$transaction(async (tx) => {
      const data = await tx.payrollSettings.upsert({
        where: { companyId: m.companyId },
        create: { ...d, companyId: m.companyId },
        update: d,
      });
      await audit(tx, m, 'PAYROLL_SETTINGS_UPDATED', data.id);
      return { data };
    });
  }

  async profile(m: Membership, employeeId: string) {
    const employee = await this.db.employee.findUnique({
      where: { companyId_id: { companyId: m.companyId, id: employeeId } },
    });
    if (!employee) throw new NotFoundException();
    return {
      data: await this.db.employeePayrollProfileVersion.findFirst({
        where: { companyId: m.companyId, employeeId },
        orderBy: { revision: 'desc' },
      }),
    };
  }

  async saveProfile(m: Membership, employeeId: string, d: PayrollProfileDto) {
    if (Object.values(d).some((value) => !value.trim()))
      fail('INVALID_CATEGORY', 'Statutory categories cannot be blank.', 400);
    return this.db.$transaction(
      async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: employeeId } },
        });
        if (!employee) throw new NotFoundException();
        const effectiveFrom = dateOnly(d.effectiveFrom);
        const latest = await tx.employeePayrollProfileVersion.findFirst({
          where: { companyId: m.companyId, employeeId },
          orderBy: { revision: 'desc' },
        });
        if (latest && effectiveFrom < latest.effectiveFrom)
          fail(
            'PROFILE_HISTORY_ORDER',
            'Changes cannot precede the latest recorded effective month.',
            409,
          );
        const locked = await tx.payrollRun.count({
          where: {
            companyId: m.companyId,
            status: { not: 'DRAFT' },
            OR: [
              { year: { gt: effectiveFrom.getUTCFullYear() } },
              {
                year: effectiveFrom.getUTCFullYear(),
                month: { gte: effectiveFrom.getUTCMonth() + 1 },
              },
            ],
          },
        });
        if (locked)
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'A calculated or finalized payroll exists in the affected period.',
            409,
          );
        const {
          effectiveFrom: ignoredDate,
          reason,
          lindungParticipation,
          ...categories
        } = d;
        void ignoredDate;
        const version = await tx.employeePayrollProfileVersion.create({
          data: {
            ...categories,
            effectiveFrom,
            reason: reason.trim(),
            lindungParticipation,
            companyId: m.companyId,
            employeeId,
            revision: (latest?.revision ?? 0) + 1,
            recordedBy: m.userId,
          },
        });
        await tx.employeePayrollProfile.upsert({
          where: {
            companyId_employeeId: { companyId: m.companyId, employeeId },
          },
          create: {
            ...categories,
            companyId: m.companyId,
            employeeId,
            taxInputs: {},
          },
          update: categories,
        });
        await audit(tx, m, 'PAYROLL_PROFILE_UPDATED', employeeId);
        return { data: version };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async profileHistory(m: Membership, employeeId: string, q: PageDto) {
    const employee = await this.db.employee.findUnique({
      where: { companyId_id: { companyId: m.companyId, id: employeeId } },
    });
    if (!employee) throw new NotFoundException();
    const where = { companyId: m.companyId, employeeId };
    const [data, total] = await this.db.$transaction([
      this.db.employeePayrollProfileVersion.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.employeePayrollProfileVersion.count({ where }),
    ]);
    return paginated(data, total, q);
  }

  async create(m: Membership, d: CreatePayrollDto) {
    return this.db.$transaction(async (tx) => {
      const data = await tx.payrollRun.create({
        data: { ...d, companyId: m.companyId, createdBy: m.userId },
      });
      await audit(tx, m, 'PAYROLL_DRAFT_CREATED', data.id);
      return { data };
    });
  }

  async list(m: Membership, q: PageDto) {
    const where = { companyId: m.companyId };
    const [data, total] = await this.db.$transaction([
      this.db.payrollRun.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      this.db.payrollRun.count({ where }),
    ]);
    return paginated(data, total, q);
  }

  async detail(m: Membership, id: string) {
    const data = await this.db.payrollRun.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!data) throw new NotFoundException();
    return { data };
  }

  // Informational only: calculation must repeat these reads in its own transaction.
  async preflight(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const run = await tx.payrollRun.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!run) throw new NotFoundException();
        const { start, next, end } = payrollPeriod(run.year, run.month);
        const issues: {
          code: string;
          message: string;
          employeeId?: string;
          scheme?: StatutoryScheme;
        }[] = [];
        const add = (
          code: string,
          message: string,
          employeeId?: string,
          scheme?: StatutoryScheme,
        ) =>
          issues.push({
            code,
            message,
            ...(employeeId ? { employeeId } : {}),
            ...(scheme ? { scheme } : {}),
          });
        const settings = await tx.payrollSettings.findUnique({
          where: { companyId: m.companyId },
        });
        if (!settings)
          add('PAYROLL_SETTINGS_REQUIRED', 'Configure payroll settings.');
        if (run.status !== 'DRAFT')
          add('INVALID_STATE', 'Only a draft can be calculated.');
        const employees = await tx.employee.findMany({
          where: {
            companyId: m.companyId,
            active: true,
            joinedDate: { lt: next },
          },
          include: {
            payrollProfileVersions: {
              where: { effectiveFrom: { lte: start } },
              orderBy: [{ effectiveFrom: 'desc' }, { revision: 'desc' }],
              take: 1,
            },
            salaries: {
              where: {
                effectiveFrom: { lt: next },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
              },
              orderBy: { effectiveFrom: 'asc' },
            },
          },
          orderBy: { employeeNo: 'asc' },
          take: 5001,
        });
        if (employees.length > 5000)
          fail(
            'PAYROLL_TOO_LARGE',
            'Payroll preflight currently supports up to 5000 employees.',
          );
        if (!employees.length)
          add(
            'NO_ELIGIBLE_EMPLOYEES',
            'No active employees joined before the end of this period.',
          );
        const rules = await tx.statutoryRuleset.findMany({
          where: {
            companyId: m.companyId,
            active: true,
            effectiveFrom: { lte: end },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
          },
        });
        const unpaidLeave = await tx.leaveRequest.findMany({
          where: {
            companyId: m.companyId,
            status: 'APPROVED',
            paid: false,
            startDate: { lte: end },
            endDate: { gte: start },
          },
        });
        for (const employee of employees) {
          try {
            calculateSalary({
              unpaidDays: resolveUnpaidDays(
                unpaidLeave.filter((r) => r.employeeId === employee.id),
                start,
                next,
              ),
              year: run.year,
              month: run.month,
              joinedDate: employee.joinedDate.toISOString().slice(0, 10),
              salaries: employee.salaries.map((s) => ({
                id: s.id,
                amount: s.amount.toFixed(2),
                effectiveFrom: s.effectiveFrom.toISOString().slice(0, 10),
                effectiveTo: s.effectiveTo?.toISOString().slice(0, 10),
              })),
            });
          } catch (error) {
            if (!(error instanceof HttpException)) throw error;
            const issue = error.getResponse() as {
              code: string;
              message: string;
            };
            add(issue.code, issue.message, employee.id);
          }
          const profile = employee.payrollProfileVersions?.[0];
          if (!profile) {
            add(
              'PAYROLL_PROFILE_REQUIRED',
              'Record statutory categories effective for this contribution month.',
              employee.id,
            );
            continue;
          }
          for (const scheme of Object.values(StatutoryScheme)) {
            // PCB uses a separate engine; never substitute a flat contribution rate.
            if (scheme === 'PCB') continue;
            const matching = rules.filter(
              (rule) =>
                rule.scheme === scheme &&
                rule.category === profile[categoryFields[scheme]],
            );
            if (
              matching.length !== 1 ||
              matching[0].effectiveFrom > start ||
              (matching[0].effectiveTo && matching[0].effectiveTo < end)
            ) {
              add(
                'STATUTORY_RULESET_REQUIRED',
                'Exactly one active ruleset must cover this entire period and category.',
                employee.id,
                scheme,
              );
            } else {
              try {
                const parameters = validateRules(matching[0].parameters);
                if (scheme === 'LINDUNG_24_JAM') {
                  const excluded = ['OPTED_OUT', 'NOT_ELIGIBLE'].includes(
                    profile.lindungParticipation,
                  );
                  if (excluded !== (parameters.kind === 'EXEMPT'))
                    add(
                      'LINDUNG_PARTICIPATION_MISMATCH',
                      'Participation status and the selected contribution/exemption rule disagree.',
                      employee.id,
                      scheme,
                    );
                }
              } catch {
                add(
                  'STATUTORY_RULESET_INVALID',
                  'The active ruleset is invalid.',
                  employee.id,
                  scheme,
                );
              }
            }
          }
        }
        const open = await tx.attendanceSession.count({
          where: {
            companyId: m.companyId,
            clockOut: null,
            clockIn: { lt: next },
          },
        });
        if (open)
          add(
            'OPEN_ATTENDANCE_SESSIONS',
            `${open} attendance sessions remain open before period end.`,
          );
        const pendingLeave = await tx.leaveRequest.count({
          where: {
            companyId: m.companyId,
            status: { in: ['PENDING_MANAGER', 'PENDING_HR'] },
            startDate: { lte: end },
            endDate: { gte: start },
          },
        });
        if (pendingLeave)
          add(
            'PENDING_LEAVE',
            `${pendingLeave} leave applications need a decision.`,
          );
        add(
          'PCB_CALCULATOR_PENDING',
          'PCB preview exists, but relief eligibility, payroll input resolution, special regimes and full official conformance remain pending.',
        );
        add(
          'PAYROLL_CALCULATOR_PENDING',
          'Salary proration core exists; automatic source resolution, run calculation and immutable snapshots remain pending.',
        );
        return {
          data: {
            runId: id,
            period: {
              from: start.toISOString().slice(0, 10),
              to: end.toISOString().slice(0, 10),
            },
            employeeCount: employees.length,
            ready: issues.length === 0,
            issues,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
