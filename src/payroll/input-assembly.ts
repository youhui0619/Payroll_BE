import {
  Claim,
  PayrollComponentDefinition,
  PayrollInput,
  Prisma,
} from '@prisma/client';
import { fail } from '../common/domain';
import { componentFromDefinition, payrollBases } from './payroll-calculator';
import { calculateSalary } from './salary-calculator';

export function assemblePayrollInputs(input: {
  companyId: string;
  runId: string;
  employeeId: string;
  salary: Parameters<typeof calculateSalary>[0];
  definitions: readonly PayrollComponentDefinition[];
  manualInputs: readonly PayrollInput[];
  claims?: readonly Claim[];
}) {
  const month = new Date(
    Date.UTC(input.salary.year, input.salary.month - 1, 1),
  );
  const salary = calculateSalary(input.salary);
  const definitions = new Map<string, PayrollComponentDefinition>();
  for (const definition of input.definitions) {
    if (definition.companyId !== input.companyId)
      fail(
        'PAYROLL_SOURCE_TENANT_MISMATCH',
        'Component definitions must belong to the payroll company.',
      );
    if (definition.effectiveFrom > month) continue;
    const previous = definitions.get(definition.code);
    if (!previous || definition.revision > previous.revision)
      definitions.set(definition.code, definition);
  }
  const resolve = (code: string) => {
    const definition = definitions.get(code);
    if (!definition?.active)
      fail(
        'COMPONENT_UNAVAILABLE',
        `Configure an active ${code} component for this payroll month.`,
      );
    return definition;
  };
  const basic = resolve('BASIC');
  if (basic.statutoryBases.includes('PCB') && basic.pcbTreatment !== 'NORMAL')
    fail(
      'INVALID_BASIC_COMPONENT',
      'Basic salary must use normal PCB remuneration.',
    );
  if (basic.kind !== 'EARNING' || !basic.affectsGross || !basic.affectsNet)
    fail(
      'INVALID_BASIC_COMPONENT',
      'BASIC must be an earning affecting gross and net pay.',
    );
  const sourceId = input.runId + ':' + input.employeeId;
  const components = [
    componentFromDefinition(basic, salary.employedSalary, {
      type: 'SALARY',
      id: sourceId,
    }),
  ];
  if (new Prisma.Decimal(salary.unpaidDeduction).gt(0)) {
    const unpaid = resolve('UNPAID_LEAVE');
    if (
      unpaid.statutoryBases.includes('PCB') &&
      unpaid.pcbTreatment !== basic.pcbTreatment
    )
      fail(
        'INVALID_UNPAID_COMPONENT',
        'Unpaid salary deductions must use the same PCB remuneration class as BASIC.',
      );
    if (
      unpaid.kind !== 'DEDUCTION' ||
      !unpaid.affectsGross ||
      !unpaid.affectsNet ||
      [...unpaid.statutoryBases].sort().join(',') !==
        [...basic.statutoryBases].sort().join(',')
    )
      fail(
        'INVALID_UNPAID_COMPONENT',
        'UNPAID_LEAVE must deduct gross/net and the same statutory bases as BASIC.',
      );
    components.push(
      componentFromDefinition(unpaid, salary.unpaidDeduction, {
        type: 'UNPAID_LEAVE',
        id: sourceId,
      }),
    );
  }
  const manualSources: {
    id: string;
    reason: string;
    createdBy: string;
    createdAt: string;
  }[] = [];
  for (const row of input.manualInputs) {
    if (
      row.companyId !== input.companyId ||
      row.runId !== input.runId ||
      row.employeeId !== input.employeeId
    )
      fail(
        'PAYROLL_SOURCE_SCOPE_MISMATCH',
        'Manual inputs must belong to this company, run and employee.',
      );
    if (row.voidedAt) continue;
    if (['BASIC', 'UNPAID_LEAVE'].includes(row.componentCode))
      fail(
        'RESERVED_PAYROLL_COMPONENT',
        'BASIC and UNPAID_LEAVE are generated from salary and approved leave; use a separate adjustment code.',
      );
    components.push(
      componentFromDefinition(
        resolve(row.componentCode),
        row.amount.toFixed(2),
        { type: 'MANUAL', id: row.id },
      ),
    );
    manualSources.push({
      id: row.id,
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    });
  }
  const claimSources: { id: string; description: string; date: string }[] = [];
  for (const claim of input.claims ?? []) {
    if (
      claim.companyId !== input.companyId ||
      claim.employeeId !== input.employeeId ||
      claim.payrollRunId !== input.runId ||
      claim.status !== 'APPROVED' ||
      claim.paymentMethod !== 'PAYROLL' ||
      !claim.payrollComponentCode
    )
      fail(
        'INVALID_PAYROLL_CLAIM',
        'Only approved claims allocated to this employee and run can be included.',
      );
    if (['BASIC', 'UNPAID_LEAVE'].includes(claim.payrollComponentCode))
      fail(
        'RESERVED_PAYROLL_COMPONENT',
        'Claims require a separate earning component.',
      );
    const definition = resolve(claim.payrollComponentCode);
    if (definition.kind !== 'EARNING' || !definition.affectsNet)
      fail(
        'INVALID_CLAIM_COMPONENT',
        'Claim component must be an earning affecting net pay.',
      );
    components.push(
      componentFromDefinition(definition, claim.amount.toFixed(2), {
        type: 'CLAIM',
        id: claim.id,
      }),
    );
    claimSources.push({
      id: claim.id,
      description: claim.description,
      date: claim.date.toISOString().slice(0, 10),
    });
  }
  return {
    ...payrollBases(components),
    salaryTrace: salary.trace,
    manualSources,
    claimSources,
  };
}
