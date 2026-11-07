import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Membership, Prisma } from '@prisma/client';
import { calculateContribution, validateRules } from './calculator';
import { statutoryCatalog } from './data/catalog';
import { RulesService } from './rules.module';
import { Database } from '../database.module';

describe('source-backed statutory catalog', () => {
  it('matches KWSP percentage examples without independently rounding both shares', () => {
    const evidence = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../statutory/sources/epf-2025-10-rate-evidence.json',
        ),
        'utf8',
      ),
    );
    for (const sample of evidence.examples) {
      const entry = statutoryCatalog.find(
        (e) => e.key === `EPF_2025_10_PART_${sample.part}`,
      );
      const result = calculateContribution(sample.wages, entry.parameters);
      expect(result).toMatchObject({
        employee: sample.employee,
        employer: sample.employer,
        total: sample.total,
      });
      expect(
        new Prisma.Decimal(result.employee)
          .plus(result.employer)
          .plus(result.remittanceRounding)
          .toFixed(2),
      ).toBe(result.total);
      expect(result.trace.roundingAllocation).toBe('UNALLOCATED');
    }
    const partF = statutoryCatalog.find((e) => e.category === 'PART_F');
    expect(calculateContribution('6710', partF.parameters)).toMatchObject({
      total: '269.00',
      remittanceRounding: '0.60',
    });
  });
  it('keeps SOCSO and LINDUNG separate and reproduces the printed combined totals', () => {
    const source = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../statutory/sources/perkeso-2026-06-extracted.json',
        ),
        'utf8',
      ),
    );
    const one = statutoryCatalog.find(
      (e) => e.key === 'SOCSO_2026_06_CATEGORY_ONE',
    );
    const two = statutoryCatalog.find(
      (e) => e.key === 'SOCSO_2026_06_CATEGORY_TWO',
    );
    const lindung = statutoryCatalog.find((e) => e.scheme === 'LINDUNG_24_JAM');
    expect(lindung.effectiveFrom).toBe('2026-06-01');
    expect(lindung.effectiveTo).toBe('2026-12-31');
    for (const row of source.rows) {
      const wage = row.upper ?? '99999.00';
      const a = calculateContribution(wage, one.parameters);
      const b = calculateContribution(wage, two.parameters);
      const l = calculateContribution(wage, lindung.parameters);
      expect(l.employer).toBe('0.00');
      expect(b.employee).toBe('0.00');
      expect(
        new Prisma.Decimal(a.employer)
          .plus(a.employee)
          .plus(l.employee)
          .toFixed(2),
      ).toBe(row.total1);
      expect(new Prisma.Decimal(b.employer).plus(l.employee).toFixed(2)).toBe(
        row.total2,
      );
    }
    expect(calculateContribution('6000.01', lindung.parameters).employee).toBe(
      '44.65',
    );
    expect(calculateContribution('6000.01', one.parameters)).toMatchObject({
      employee: '29.75',
      employer: '104.15',
    });
    expect(calculateContribution('6000.01', two.parameters).employer).toBe(
      '74.40',
    );
  });
  it.each(statutoryCatalog)(
    '$key retains its artifact checksum and contiguous bands',
    (entry) => {
      const bytes = readFileSync(
        resolve(__dirname, '../../statutory/sources', entry.sourceArtifact),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        entry.sourceSha256,
      );
      for (const supporting of entry.supportingSources ?? []) {
        const supportingBytes = readFileSync(
          resolve(
            __dirname,
            '../../statutory/sources',
            supporting.sourceArtifact,
          ),
        );
        expect(createHash('sha256').update(supportingBytes).digest('hex')).toBe(
          supporting.sourceSha256,
        );
      }
      expect(() => validateRules(entry.parameters)).not.toThrow();
      for (const band of entry.parameters.bands ?? []) {
        for (const wage of [
          new Prisma.Decimal(band.lower).plus('0.01').toFixed(2),
          band.upper,
        ]) {
          expect(calculateContribution(wage, entry.parameters)).toMatchObject({
            employee: new Prisma.Decimal(band.employee).toFixed(2),
            employer: new Prisma.Decimal(band.employer).toFixed(2),
          });
        }
      }
    },
  );
  it('preserves EPF Part A threshold changes without capping higher wages', () => {
    const rules = statutoryCatalog.find(
      (e) => e.key === 'EPF_2025_10_PART_A',
    ).parameters;
    expect(calculateContribution('10', rules)).toMatchObject({
      employee: '0.00',
      employer: '0.00',
    });
    expect(calculateContribution('5000', rules)).toMatchObject({
      employee: '550.00',
      employer: '650.00',
    });
    expect(calculateContribution('5000.01', rules)).toMatchObject({
      employee: '561.00',
      employer: '612.00',
    });
    expect(calculateContribution('20000', rules)).toMatchObject({
      employee: '2200.00',
      employer: '2400.00',
    });
    expect(calculateContribution('20000.01', rules)).toMatchObject({
      total: '4601.00',
      remittanceRounding: '1.00',
      trace: { branch: 'ABOVE_TABLE' },
    });
  });
  it('uses the EIS ceiling and includes both sides of its first boundary', () => {
    const rules = statutoryCatalog.find((e) => e.scheme === 'EIS').parameters;
    expect(calculateContribution('30', rules).employee).toBe('0.05');
    expect(calculateContribution('30.01', rules).employee).toBe('0.10');
    expect(calculateContribution('6000.01', rules)).toMatchObject({
      basis: '6000.00',
      employee: '11.90',
      employer: '11.90',
    });
  });
  it('imports into the requesting company as an inactive draft with provenance', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({
      id: 'rule',
      ...data,
      active: false,
    }));
    const tx = {
      statutoryRuleset: { create },
      auditEvent: { create: jest.fn() },
    };
    const db = {
      $transaction: (callback: (value: unknown) => unknown) => callback(tx),
    };
    const service = new RulesService(db as unknown as Database);
    const result = await service.importCatalog(
      { companyId: 'company', id: 'membership', userId: 'user' } as Membership,
      'EPF_2025_10_PART_A',
    );
    expect(result.data).toMatchObject({
      companyId: 'company',
      active: false,
      parameters: {
        provenance: {
          checksumKind: 'EXTRACTED_DATA',
          catalogKey: 'EPF_2025_10_PART_A',
        },
      },
    });
    await expect(
      service.importCatalog({} as Membership, 'unknown'),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
    expect(service.catalog().data[0]).not.toHaveProperty('parameters');
  });
});
