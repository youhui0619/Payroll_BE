import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { paginated } from '../common/page.dto';
import { calculateFamilyReliefs } from './family-reliefs';
import { TaxFamilyDto } from './tax-family.dto';
import { TaxOpeningQueryDto } from './tax-openings.dto';

@Injectable()
export class TaxFamilyService {
  constructor(private db: Database) {}
  async save(m: Membership, employeeId: string, d: TaxFamilyDto) {
    if (!d.reason.trim() || !d.evidenceReference.trim())
      fail(
        'TAX_EVIDENCE_REQUIRED',
        'Provide reviewed evidence and a reason.',
        400,
      );
    const { effectiveMonth, evidenceReference, reason, ...declaration } = d;
    const reliefs = calculateFamilyReliefs(declaration);
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.employee.findUnique({
            where: { companyId_id: { companyId: m.companyId, id: employeeId } },
          }))
        )
          throw new NotFoundException();
        const latest = await tx.employeeTaxFamily.findFirst({
          where: { companyId: m.companyId, employeeId, year: d.year },
          orderBy: { revision: 'desc' },
        });
        if (latest && effectiveMonth < latest.effectiveMonth)
          fail(
            'TAX_FAMILY_HISTORY_ORDER',
            'A revision cannot precede the latest effective month.',
            409,
          );
        if (
          await tx.payrollRun.count({
            where: {
              companyId: m.companyId,
              year: d.year,
              month: { gte: effectiveMonth },
              status: { not: 'DRAFT' },
            },
          })
        )
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'This revision affects calculated or finalized payroll.',
            409,
          );
        const data = await tx.employeeTaxFamily.create({
          data: {
            companyId: m.companyId,
            employeeId,
            year: d.year,
            effectiveMonth,
            revision: (latest?.revision ?? 0) + 1,
            declaration: JSON.parse(
              JSON.stringify(declaration),
            ) as Prisma.InputJsonValue,
            reliefs: reliefs as unknown as Prisma.InputJsonValue,
            evidenceReference: evidenceReference.trim(),
            reason: reason.trim(),
            recordedBy: m.userId,
          },
        });
        await audit(tx, m, 'EMPLOYEE_TAX_FAMILY_RECORDED', data.id);
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
      this.db.employeeTaxFamily.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.employeeTaxFamily.count({ where }),
    ]);
    return paginated(data, total, q);
  }
}
