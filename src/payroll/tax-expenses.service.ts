import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { paginated } from '../common/page.dto';
import { calculateTp1Reliefs } from './tp1-reliefs';
import { TaxExpensesDto } from './tax-expenses.dto';
import { TaxOpeningQueryDto } from './tax-openings.dto';

@Injectable()
export class TaxExpensesService {
  constructor(private db: Database) {}
  async save(m: Membership, employeeId: string, d: TaxExpensesDto) {
    if (!d.reason.trim() || !d.evidenceReference.trim())
      fail(
        'TAX_EVIDENCE_REQUIRED',
        'Provide a review reference and reason.',
        400,
      );
    // Validate codes, amounts and mutually exclusive bands. Do not freeze an
    // allowed total here: spouse/EPF context belongs to the payroll calculation.
    const validated = calculateTp1Reliefs({
      ...d,
      spouseRelief: '0',
      projectedMandatoryEpf: '0',
    });
    const amounts = Object.fromEntries(
      validated.groups.flatMap((group) =>
        group.subitems.map((item) => [item.code, item.claimed]),
      ),
    );
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.employee.findUnique({
            where: { companyId_id: { companyId: m.companyId, id: employeeId } },
          }))
        )
          throw new NotFoundException();
        const latest = await tx.employeeTaxExpenses.findFirst({
          where: { companyId: m.companyId, employeeId, year: d.year },
          orderBy: { revision: 'desc' },
        });
        if (latest && d.effectiveMonth < latest.effectiveMonth)
          fail(
            'TAX_EXPENSE_HISTORY_ORDER',
            'A replacement cannot precede the latest effective month.',
            409,
          );
        if (
          await tx.payrollRun.count({
            where: {
              companyId: m.companyId,
              year: d.year,
              month: { gte: d.effectiveMonth },
              status: { not: 'DRAFT' },
            },
          })
        )
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'This declaration affects calculated or finalized payroll.',
            409,
          );
        const data = await tx.employeeTaxExpenses.create({
          data: {
            companyId: m.companyId,
            employeeId,
            year: d.year,
            effectiveMonth: d.effectiveMonth,
            revision: (latest?.revision ?? 0) + 1,
            amounts,
            evidenceReference: d.evidenceReference.trim(),
            reason: d.reason.trim(),
            recordedBy: m.userId,
          },
        });
        await audit(tx, m, 'EMPLOYEE_TAX_EXPENSES_RECORDED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async history(m: Membership, employeeId: string, q: TaxOpeningQueryDto) {
    if (
      !(await this.db.employee.findUnique({
        where: { companyId_id: { companyId: m.companyId, id: employeeId } },
      }))
    )
      throw new NotFoundException();
    const where = { companyId: m.companyId, employeeId, year: q.year };
    const [data, total] = await this.db.$transaction([
      this.db.employeeTaxExpenses.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.employeeTaxExpenses.count({ where }),
    ]);
    return paginated(data, total, q);
  }
}
