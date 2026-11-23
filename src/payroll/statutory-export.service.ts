import { Injectable } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { csv } from '../reports/reports.utils';

export const STATUTORY_EXPORT_SCHEMES = [
  'EPF',
  'SOCSO',
  'EIS',
  'LINDUNG_24_JAM',
  'PCB',
  'HRD',
] as const;
export type StatutoryExportScheme = (typeof STATUTORY_EXPORT_SCHEMES)[number];

const money = (value: unknown) =>
  value === undefined || value === null ? '' : Number(value).toFixed(2);

@Injectable()
export class StatutoryExportService {
  constructor(private db: Database) {}

  async export(m: Membership, runId: string, scheme: StatutoryExportScheme) {
    const run = await this.db.payrollRun.findUnique({
      where: { companyId_id: { companyId: m.companyId, id: runId } },
      include: {
        employees: {
          include: { employee: { select: { employeeNo: true, name: true } } },
          orderBy: { employee: { employeeNo: 'asc' } },
        },
      },
    });
    if (!run) fail('NOT_FOUND', 'Payroll run not found.', 404);
    if (!['PUBLISHED', 'PAID'].includes(run.status))
      fail(
        'STATUTORY_EXPORT_NOT_READY',
        'Statutory exports are available after payroll publication.',
        409,
      );
    const rows = run.employees.map((row) => {
      const snapshot = row.snapshot as any;
      const statutory = (snapshot.totals?.statutory ?? []).find(
        (item: any) => item.scheme === scheme,
      );
      const pcb = scheme === 'PCB' ? snapshot.pcb : undefined;
      const contributionBase =
        scheme === 'PCB'
          ? (pcb?.taxableRemuneration ?? snapshot.totals?.bases?.PCB)
          : (statutory?.base ?? snapshot.totals?.bases?.[scheme]);
      return [
        'payroll-statutory-review-v1',
        'STATUTORY_REVIEW',
        m.companyId,
        run.id,
        run.year,
        run.month,
        scheme,
        row.employee.employeeNo,
        row.employee.name,
        money(row.gross),
        money(contributionBase),
        money(pcb?.amount ?? statutory?.employeeDeduction),
        money(statutory?.employerCost),
        money(statutory?.remittance),
      ];
    });
    await audit(this.db, m, 'STATUTORY_EXPORTED', run.id, {
      scheme,
      schemaVersion: 'payroll-statutory-review-v1',
    });
    return {
      filename: `${scheme.toLowerCase()}-${run.year}-${String(run.month).padStart(2, '0')}-review.csv`,
      content: csv(
        [
          'Schema',
          'Export type',
          'Company ID',
          'Payroll run ID',
          'Year',
          'Month',
          'Scheme',
          'Employee number',
          'Employee name',
          'Gross pay',
          'Contribution base',
          'Employee amount',
          'Employer amount',
          'Remittance amount',
        ],
        rows,
      ),
    };
  }
}
