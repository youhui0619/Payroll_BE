import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit, dateOnly, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import {
  ACTIVE_STATUS_VALUES,
  makeStatusCounts,
} from '../common/status-summary';
import {
  ComponentDefinitionDto,
  ComponentListDto,
} from './component-definitions.dto';

@Injectable()
export class ComponentDefinitionsService {
  constructor(private db: Database) {}
  async save(m: Membership, d: ComponentDefinitionDto) {
    const pcbTreatment = d.pcbTreatment ?? 'UNCLASSIFIED';
    if (
      d.statutoryBases.includes('PCB')
        ? !['NORMAL', 'ADDITIONAL'].includes(pcbTreatment)
        : ![
            'EXCLUDED',
            'EXCLUDED_NORMAL',
            'EXCLUDED_ADDITIONAL',
            'UNCLASSIFIED',
          ].includes(pcbTreatment)
    )
      fail(
        'INVALID_PCB_TREATMENT',
        'PCB wage-base flags and remuneration classification must agree.',
        400,
      );
    if (!d.name.trim() || !d.reason.trim())
      fail(
        'INVALID_COMPONENT_DEFINITION',
        'Name and reason cannot be blank.',
        400,
      );
    if (!d.affectsGross && !d.affectsNet && !d.statutoryBases.length)
      fail(
        'INVALID_COMPONENT_DEFINITION',
        'A component must affect pay or a statutory basis.',
        400,
      );
    return this.db.$transaction(
      async (tx) => {
        const effectiveFrom = dateOnly(d.effectiveFrom);
        const latest = await tx.payrollComponentDefinition.findFirst({
          where: { companyId: m.companyId, code: d.code },
          orderBy: { revision: 'desc' },
        });
        if (latest && effectiveFrom < latest.effectiveFrom)
          fail(
            'COMPONENT_HISTORY_ORDER',
            'Changes cannot precede the latest effective month for this code.',
            409,
          );
        if (!latest) {
          const codes = await tx.payrollComponentDefinition.groupBy({
            by: ['code'],
            where: { companyId: m.companyId },
            orderBy: { code: 'asc' },
            take: 1000,
          });
          if (codes.length >= 1000)
            fail(
              'COMPONENT_LIMIT',
              'A company may have at most 1000 component codes.',
            );
        }
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
        const data = await tx.payrollComponentDefinition.create({
          data: {
            ...d,
            pcbTreatment,
            name: d.name.trim(),
            reason: d.reason.trim(),
            effectiveFrom,
            companyId: m.companyId,
            revision: (latest?.revision ?? 0) + 1,
            recordedBy: m.userId,
          },
        });
        await audit(tx, m, 'PAYROLL_COMPONENT_REVISED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async list(m: Membership, q: ComponentListDto) {
    return this.db.$transaction(
      async (tx) => {
        const groups = await tx.payrollComponentDefinition.groupBy({
          by: ['code'],
          where: {
            companyId: m.companyId,
            effectiveFrom: { lte: dateOnly(q.asOf) },
            ...(q.search ? { code: { contains: q.search.toUpperCase() } } : {}),
          },
          _max: { revision: true },
          orderBy: { code: 'asc' },
          take: 1001,
        });
        if (groups.length > 1000)
          fail('COMPONENT_LIMIT', 'Component code limit exceeded.');
        if (!groups.length)
          return paginated([], 0, q, {
            summary: {
              statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES),
            },
          });
        const allData = await tx.payrollComponentDefinition.findMany({
          where: {
            companyId: m.companyId,
            OR: groups.map((g) => ({
              code: g.code,
              revision: g._max.revision,
            })),
          },
          orderBy: { code: 'asc' },
        });
        const data = allData.slice(
          (q.page - 1) * q.pageSize,
          q.page * q.pageSize,
        );
        const statusCountValues = ACTIVE_STATUS_VALUES.map(
          (status) =>
            allData.filter((row) => row.active === (status === 'ACTIVE'))
              .length,
        );
        return paginated(data, groups.length, q, {
          summary: {
            statusCounts: makeStatusCounts(
              ACTIVE_STATUS_VALUES,
              statusCountValues,
            ),
          },
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async history(m: Membership, code: string, q: PageDto) {
    const where = { companyId: m.companyId, code };
    const [data, total] = await this.db.$transaction([
      this.db.payrollComponentDefinition.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.payrollComponentDefinition.count({ where }),
    ]);
    if (!total) throw new NotFoundException();
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.payrollComponentDefinition.count({
          where: { ...where, active: status === 'ACTIVE' },
        }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES, statusCountValues),
      },
    });
  }
}
