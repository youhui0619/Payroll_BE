import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { paginated } from '../common/page.dto';
import { TaxOpeningDto, TaxOpeningQueryDto } from './tax-openings.dto';

@Injectable()
export class TaxOpeningsService {
  constructor(private db: Database) {}
  async save(m: Membership, employeeId: string, d: TaxOpeningDto) {
    if (!d.reason.trim() || !d.evidenceReference.trim())
      fail(
        'TAX_EVIDENCE_REQUIRED',
        'Provide a review reference and reason.',
        400,
      );
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.employee.findUnique({
            where: { companyId_id: { companyId: m.companyId, id: employeeId } },
          }))
        )
          throw new NotFoundException();
        const latest = await tx.employeeTaxOpening.findFirst({
          where: { companyId: m.companyId, employeeId, year: d.year },
          orderBy: { revision: 'desc' },
        });
        if (latest && d.effectiveMonth < latest.effectiveMonth)
          fail(
            'TAX_OPENING_HISTORY_ORDER',
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
            'This revision affects calculated or finalized payroll.',
            409,
          );
        const data = await tx.employeeTaxOpening.create({
          data: {
            ...d,
            reason: d.reason.trim(),
            evidenceReference: d.evidenceReference.trim(),
            companyId: m.companyId,
            employeeId,
            revision: (latest?.revision ?? 0) + 1,
            recordedBy: m.userId,
          },
        });
        await audit(tx, m, 'EMPLOYEE_TAX_OPENING_RECORDED', data.id);
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
      this.db.employeeTaxOpening.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.employeeTaxOpening.count({ where }),
    ]);
    return paginated(data, total, q);
  }
}
