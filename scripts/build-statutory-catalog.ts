import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { validateRules } from '../src/payroll/calculator';

// Build only from reviewed source artifacts. This command never connects to a DB.
const root = resolve(__dirname, '..');
const read = (name: string) =>
  readFileSync(resolve(root, 'statutory/sources', name));
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const epfBytes = read('epf-2025-10-extracted.json');
const epf = JSON.parse(epfBytes.toString());
const rateBytes = read('epf-2025-10-rate-evidence.json');
const rateEvidence = JSON.parse(rateBytes.toString());
const rateSource = { sourceUrl: rateEvidence.sourceUrl, sourceArtifact: 'epf-2025-10-rate-evidence.json', sourceSha256: sha(rateBytes), checksumKind: 'EXTRACTED_DATA' };
const entries = [];
for (const part of ['A', 'C', 'E']) {
  const rows = epf.parts[part];
  if (rows.length !== 401) throw new Error(`EPF ${part}: expected 401 bands`);
  let previous = new Prisma.Decimal(0);
  const bands = rows.map(
    (row: { from: string; to: string; employee: string; employer: string }) => {
      const lower = new Prisma.Decimal(row.from).minus('0.01');
      if (!lower.equals(previous))
        throw new Error(`EPF ${part}: noncontiguous source`);
      previous = new Prisma.Decimal(row.to);
      return {
        lower: lower.toFixed(2),
        upper: previous.toFixed(2),
        employee: row.employee,
        employer: row.employer,
      };
    },
  );
  if (!previous.equals(20000)) throw new Error('Incomplete EPF table');
  const parameters = { kind: 'TABLE', bands, aboveTable: { ...rateEvidence.rates[part], rounding: 'TOTAL_WHOLE_UP' } };
  validateRules(parameters);
  entries.push({
    key: `EPF_2025_10_PART_${part}`,
    scheme: 'EPF',
    category: `PART_${part}`,
    version: '2025-10-v2',
    effectiveFrom: '2025-10-01',
    sourceUrl: epf.sourceUrl,
    sourceSha256: sha(epfBytes),
    checksumKind: 'EXTRACTED_DATA',
    sourceArtifact: 'epf-2025-10-extracted.json',
    supportingSources: [rateSource],
    limitations: [
      'Above RM20000, remit the rounded combined total. remittanceRounding remains unallocated; payroll must resolve it explicitly before deductions.',
      'Employee category must be verified against the schedule eligibility before assignment.',
    ],
    parameters,
  });
}
entries.push({ key: 'EPF_2025_10_PART_F', scheme: 'EPF', category: 'PART_F', version: '2025-10-v1', effectiveFrom: '2025-10-01', ...rateSource,
  limitations: ['Verify employee eligibility for Part F before assignment.', 'Remit the rounded combined total. remittanceRounding remains unallocated; payroll must resolve it explicitly before deductions.'],
  parameters: { kind: 'RATE', ...rateEvidence.rates.F, rounding: 'TOTAL_WHOLE_UP' },
});
const eis = JSON.parse(read('eis-2024-10-extracted.json').toString());
if (eis.rules.bands.length !== 64)
  throw new Error('EIS: expected 64 capped bands');
validateRules(eis.rules);
entries.push({
  key: 'EIS_2024_10',
  scheme: 'EIS',
  category: 'ELIGIBLE',
  version: '2024-10-v1',
  effectiveFrom: '2024-10-01',
  sourceUrl: eis.sourceUrl,
  sourceSha256: sha(read('eis-2024-10.pdf')),
  checksumKind: 'ORIGINAL_PDF',
  sourceArtifact: 'eis-2024-10.pdf',
  limitations: [
    'Employee age and contribution-history eligibility must be established before assigning ELIGIBLE.',
  ],
  parameters: eis.rules,
});
const perkeso = JSON.parse(read('perkeso-2026-06-extracted.json').toString());
type PerkesoRow = { index: number; lower: string; upper: string | null; employer1: string; employee1: string; employer2: string; lindung: string; total1: string; total2: string };
const rows: PerkesoRow[] = perkeso.rows;
if (rows.length !== 65 || rows[64].lower !== '6000.00' || rows[64].upper !== null)
  throw new Error('PERKESO: incomplete schedule');
for (const [index, row] of rows.entries()) {
  if (row.index !== index + 1 || (index && row.lower !== rows[index - 1].upper))
    throw new Error('PERKESO: invalid source ordering');
  if (!new Prisma.Decimal(row.employer1).plus(row.employee1).plus(row.lindung).equals(row.total1) || !new Prisma.Decimal(row.employer2).plus(row.lindung).equals(row.total2))
    throw new Error('PERKESO: printed total mismatch');
}
for (const category of ['CATEGORY_ONE', 'CATEGORY_TWO', 'PHASE_ONE']) {
  const lindung = category === 'PHASE_ONE';
  const parameters = { kind: 'TABLE', ceiling: '6000.00', bands: rows.slice(0,64).map(row => ({ lower: row.lower, upper: row.upper, employee: lindung ? row.lindung : category === 'CATEGORY_ONE' ? row.employee1 : '0.00', employer: lindung ? '0.00' : category === 'CATEGORY_ONE' ? row.employer1 : row.employer2 })) };
  validateRules(parameters);
  entries.push({ key: `${lindung ? 'LINDUNG' : 'SOCSO'}_2026_06_${category}`, scheme: lindung ? 'LINDUNG_24_JAM' : 'SOCSO', category, version: '2026-06-v1', effectiveFrom: '2026-06-01',
    ...(lindung ? { effectiveTo: '2026-12-31' } : {}),
    sourceUrl: perkeso.sourceUrl, sourceSha256: sha(read('perkeso-combined-2026-06.pdf')), checksumKind: 'ORIGINAL_PDF', sourceArtifact: 'perkeso-combined-2026-06.pdf',
    limitations: lindung ? ['Catalog coverage is limited to June–December 2026; this end date is a verification cutoff, not a statutory sunset. Future phase dates require authority verification.', 'Participation/opt-out and employee eligibility must be verified for the contribution month.'] : ['SOCSO columns only: LINDUNG 24 Jam must be calculated separately when applicable.', 'Employee age, contribution history and worker category must be verified before assignment.'], parameters });
}
mkdirSync(resolve(root, 'src/payroll/data'), { recursive: true });
writeFileSync(
  resolve(root, 'src/payroll/data/catalog.ts'),
  `// Generated by scripts/build-statutory-catalog.ts from reviewed source artifacts.\nimport { StatutoryCatalogEntry } from '../statutory-catalog.types';\nexport const statutoryCatalog: StatutoryCatalogEntry[] = ${JSON.stringify(entries, null, 2)};\n`,
);
console.log(
  `Built ${entries.length} catalog entries (${entries.reduce((count, entry) => count + (entry.parameters.bands?.length ?? 0), 0)} bands).`,
);
