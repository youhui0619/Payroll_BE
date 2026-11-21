import { Prisma } from '@prisma/client';

export interface TaxPeriodAmounts {
  taxableIncome: string;
  employeeEpf: string;
  mtd: string;
  zakat: string;
}
export interface TaxPeriodSnapshot extends TaxPeriodAmounts {
  version: 1;
  companyId: string;
  employeeId: string;
  runId: string;
  year: number;
  month: number;
}
type PriorRun = {
  id: string;
  companyId: string;
  year: number;
  month: number;
  status: string;
  employees: {
    id: string;
    companyId: string;
    employeeId: string;
    snapshot: unknown;
  }[];
};
const fields = ['taxableIncome', 'employeeEpf', 'mtd', 'zakat'] as const;
const zero = (): TaxPeriodAmounts => ({
  taxableIncome: '0.00',
  employeeEpf: '0.00',
  mtd: '0.00',
  zakat: '0.00',
});
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Current-employer YTD is derived from paid, versioned monthly snapshots.
 * Missing/unsettled months are explicit blockers, never presumed zero. Values
 * are period-only: previous-employer openings must not be copied into them. */
export function resolveTaxYtd(input: {
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
  joinedDate: Date;
  runs: readonly PriorRun[];
}) {
  const totals = zero();
  const issues: { code: string; message: string; month?: number }[] = [];
  const sources: {
    runId: string;
    payrollEmployeeId: string;
    month: number;
    amounts: TaxPeriodAmounts;
  }[] = [];
  if (
    !Number.isInteger(input.year) ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12 ||
    !Number.isFinite(input.joinedDate.getTime())
  ) {
    return {
      ready: false,
      totals,
      sources,
      issues: [
        {
          code: 'INVALID_YTD_PERIOD',
          message:
            'A valid payroll period and employment start date are required.',
        },
      ],
    };
  }
  const firstMonth =
    input.joinedDate.getUTCFullYear() < input.year
      ? 1
      : input.joinedDate.getUTCFullYear() === input.year
        ? input.joinedDate.getUTCMonth() + 1
        : 13;
  const scoped = input.runs.filter(
    (run) =>
      run.companyId === input.companyId &&
      run.year === input.year &&
      run.month < input.month &&
      run.month >= firstMonth,
  );
  for (let month = firstMonth; month < input.month; month++) {
    const runs = scoped.filter((run) => run.month === month);
    const add = (code: string, message: string) =>
      issues.push({ code, message, month });
    if (runs.length !== 1) {
      add(
        'PAYROLL_YTD_MONTH_REQUIRED',
        'Exactly one prior payroll run is required for this employment month.',
      );
      continue;
    }
    const run = runs[0];
    if (run.status !== 'PAID') {
      add(
        'PAYROLL_YTD_UNSETTLED',
        'Prior payroll must be paid before its tax values can be accumulated.',
      );
      continue;
    }
    const rows = run.employees.filter(
      (row) =>
        row.companyId === input.companyId &&
        row.employeeId === input.employeeId,
    );
    if (rows.length !== 1) {
      add(
        'PAYROLL_YTD_EMPLOYEE_REQUIRED',
        'Prior paid payroll requires one employee calculation snapshot.',
      );
      continue;
    }
    const tax = object(object(rows[0].snapshot)?.taxPeriod);
    if (
      !tax ||
      tax.version !== 1 ||
      tax.companyId !== input.companyId ||
      tax.employeeId !== input.employeeId ||
      tax.runId !== run.id ||
      tax.year !== input.year ||
      tax.month !== month ||
      fields.some(
        (field) =>
          typeof tax[field] !== 'string' ||
          !/^\d{1,12}(\.\d{1,2})?$/.test(tax[field] as string),
      )
    ) {
      add(
        'PAYROLL_YTD_SNAPSHOT_INVALID',
        'Prior payroll lacks a valid versioned period tax snapshot. Reconcile its original calculation; do not infer tax amounts from gross/net.',
      );
      continue;
    }
    const amounts = zero();
    for (const field of fields) {
      amounts[field] = new Prisma.Decimal(tax[field] as string).toFixed(2);
      totals[field] = new Prisma.Decimal(totals[field])
        .plus(amounts[field])
        .toFixed(2);
    }
    sources.push({
      runId: run.id,
      payrollEmployeeId: rows[0].id,
      month,
      amounts,
    });
  }
  return { ready: issues.length === 0, totals, sources, issues };
}
