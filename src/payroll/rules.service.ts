import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { audit, dateOnly, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import {
  ACTIVE_STATUS_VALUES,
  makeStatusCounts,
} from '../common/status-summary';
import { calculateContribution, validateRules } from './calculator';
import { statutoryCatalog } from './data/catalog';
import { RulesDto } from './rules.dto';

@Injectable()
export class RulesService {
  constructor(private db: Database) {}
  catalog() {
    return {
      data: statutoryCatalog.map(({ parameters, ...entry }) => ({
        ...entry,
        calculator: parameters.kind,
        bandCount: parameters.bands?.length ?? 0,
      })),
    };
  }
  async importCatalog(m: Membership, key: string) {
    const entry = statutoryCatalog.find((item) => item.key === key);
    if (!entry) throw new NotFoundException();
    return this.create(m, {
      scheme: entry.scheme,
      category: entry.category,
      version: entry.version,
      effectiveFrom: entry.effectiveFrom,
      effectiveTo: entry.effectiveTo,
      sourceUrl: entry.sourceUrl,
      sourceSha256: entry.sourceSha256,
      parameters: {
        ...entry.parameters,
        provenance: {
          catalogKey: entry.key,
          checksumKind: entry.checksumKind,
          sourceArtifact: entry.sourceArtifact,
          supportingSources: entry.supportingSources ?? [],
          limitations: entry.limitations,
        },
      },
    });
  }
  async list(m: Membership, q: PageDto) {
    const where = { companyId: m.companyId };
    const [data, total] = await this.db.$transaction([
      this.db.statutoryRuleset.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.statutoryRuleset.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.statutoryRuleset.count({
          where: { companyId: m.companyId, active: status === 'ACTIVE' },
        }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES, statusCountValues),
      },
    });
  }
  async create(m: Membership, d: RulesDto) {
    validateRules(d.parameters);
    if (d.scheme === 'PCB')
      fail(
        'PCB_CALCULATOR_PENDING',
        'PCB needs its dedicated computerized calculation and conformance suite; contribution tables cannot substitute for PCB.',
        422,
      );
    if (d.effectiveTo && d.effectiveTo < d.effectiveFrom)
      fail('INVALID_DATES', 'End date precedes start date.', 400);
    const host = new URL(d.sourceUrl).hostname;
    const domains = [
      'kwsp.gov.my',
      'perkeso.gov.my',
      'hasil.gov.my',
      'hrdcorp.gov.my',
    ];
    if (
      !domains.some((domain) => host === domain || host.endsWith('.' + domain))
    )
      fail(
        'INVALID_SOURCE',
        'Use an official statutory authority source URL.',
        400,
      );
    return this.db.$transaction(async (tx) => {
      const data = await tx.statutoryRuleset.create({
        data: {
          ...d,
          companyId: m.companyId,
          parameters: d.parameters as Prisma.InputJsonValue,
          effectiveFrom: dateOnly(d.effectiveFrom),
          effectiveTo: d.effectiveTo ? dateOnly(d.effectiveTo) : null,
        },
      });
      await audit(tx, m, 'RULESET_IMPORTED', data.id);
      return { data };
    });
  }
  async activate(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.statutoryRuleset.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        const overlaps = await tx.statutoryRuleset.count({
          where: {
            companyId: m.companyId,
            scheme: row.scheme,
            category: row.category,
            active: true,
            id: { not: id },
            ...(row.effectiveTo
              ? { effectiveFrom: { lte: row.effectiveTo } }
              : {}),
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: row.effectiveFrom } },
            ],
          },
        });
        if (overlaps)
          fail(
            'RULESET_OVERLAP',
            'Active rulesets may not overlap for the same scheme/category.',
            409,
          );
        const data = await tx.statutoryRuleset.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { active: true },
        });
        await audit(tx, m, 'RULESET_ACTIVATED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async preview(m: Membership, id: string, wages: string) {
    const row = await this.db.statutoryRuleset.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!row) throw new NotFoundException();
    return {
      data: {
        ...calculateContribution(wages, row.parameters),
        rulesetId: row.id,
        version: row.version,
        scheme: row.scheme,
        sourceUrl: row.sourceUrl,
        sourceSha256: row.sourceSha256,
        provenance: (row.parameters as Prisma.JsonObject).provenance ?? null,
      },
    };
  }
  async retire(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.statutoryRuleset.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        const data = row.active
          ? await tx.statutoryRuleset.update({
              where: { companyId_id: { companyId: m.companyId, id } },
              data: { active: false },
            })
          : row;
        if (row.active) await audit(tx, m, 'RULESET_RETIRED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
