import { Prisma } from '@prisma/client';
import { fail } from '../common/domain';
import { calculateContribution } from './calculator';
import { PayrollComponent, payrollBases } from './payroll-calculator';
import { PCB_SOURCE, PCB_SOURCE_SHA256 } from './pcb-calculator';

/** LHDN section 13: normal EPF from normal EPF wages; additional EPF is
 * total employee EPF less normal EPF, including EPF on exempt allowances. */
export function allocateEpfForPcb(
  components: readonly PayrollComponent[],
  parameters: unknown,
) {
  const wages = payrollBases(components);
  let normal = new Prisma.Decimal(0),
    additional = new Prisma.Decimal(0);
  const sources: {
    type: string;
    id: string;
    treatment: string;
    signedAmount: string;
  }[] = [];
  for (const line of wages.lines) {
    if (!line.statutoryBases.includes('EPF')) continue;
    const treatment = line.pcbTreatment;
    if (
      ![
        'NORMAL',
        'ADDITIONAL',
        'EXCLUDED_NORMAL',
        'EXCLUDED_ADDITIONAL',
      ].includes(treatment)
    )
      fail(
        'EPF_CLASSIFICATION_REQUIRED',
        'Every EPF-bearing line must identify normal or additional remuneration, including tax-exempt payments.',
      );
    if (['NORMAL', 'EXCLUDED_NORMAL'].includes(treatment))
      normal = normal.plus(line.signedAmount);
    else additional = additional.plus(line.signedAmount);
    sources.push({
      ...line.source,
      treatment,
      signedAmount: line.signedAmount,
    });
  }
  if (normal.lt(0) || additional.lt(0))
    fail(
      'NEGATIVE_EPF_REMUNERATION',
      'EPF normal and additional wage bases must each remain non-negative.',
    );
  const normalResult = calculateContribution(normal.toFixed(2), parameters);
  const totalResult = calculateContribution(wages.bases.EPF, parameters);
  const additionalEpf = new Prisma.Decimal(totalResult.employee).minus(
    normalResult.employee,
  );
  if (additionalEpf.lt(0))
    fail(
      'INVALID_EPF_ALLOCATION',
      'Total employee EPF cannot be below the normal employee share.',
    );
  return {
    normalEpf: normalResult.employee,
    additionalEpf: additionalEpf.toFixed(2),
    totalEmployeeEpf: totalResult.employee,
    trace: {
      normalWages: normal.toFixed(2),
      additionalWages: additional.toFixed(2),
      totalWages: wages.bases.EPF,
      normalCalculation: normalResult,
      totalCalculation: totalResult,
      sources,
      reference: 'LHDN 2026 section 13',
      sourceUrl: PCB_SOURCE,
      sourceSha256: PCB_SOURCE_SHA256,
    },
  };
}
