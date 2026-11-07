import { Prisma } from '@prisma/client';
import { fail } from '../common/domain';
import { calculatePcb, PcbInput, PCB_SOURCE_SHA256 } from './pcb-calculator';
import { calculateFamilyReliefs, FamilyReliefInput } from './family-reliefs';
import { calculateTp1Reliefs, Tp1Code } from './tp1-reliefs';

/** Connect reviewed declarations to each annual-tax projection. In particular,
 * additional remuneration can change the mandatory EPF amount already used,
 * so voluntary EPF's remaining allowance must be calculated per projection. */
export function calculateDeclaredPcb(
  remuneration: Omit<PcbInput, 'residency' | 'category' | 'qualifyingReliefs'>,
  family: FamilyReliefInput,
  expenses: Partial<Record<Tp1Code, string>>,
) {
  if (family.year !== remuneration.year)
    fail(
      'TAX_DECLARATION_YEAR_MISMATCH',
      'Tax declarations and payroll must use the same year.',
      400,
    );
  const familyReliefs = calculateFamilyReliefs(family);
  // Validate the declaration even for a non-resident whose reliefs are unused.
  calculateTp1Reliefs({
    year: family.year,
    amounts: expenses,
    spouseRelief: familyReliefs.spouse,
    projectedMandatoryEpf: '0',
  });
  const expenseTraces: {
    projection: 'NORMAL' | 'ADDITIONAL';
    calculation: ReturnType<typeof calculateTp1Reliefs>;
  }[] = [];
  const result = calculatePcb(
    {
      ...remuneration,
      residency: family.residency,
      category: family.category,
      qualifyingReliefs: familyReliefs.familyReliefs,
    },
    (projection) => {
      const calculation = calculateTp1Reliefs({
        year: family.year,
        amounts: expenses,
        spouseRelief: familyReliefs.spouse,
        projectedMandatoryEpf: projection.annual,
      });
      expenseTraces.push({
        projection: projection.includesAdditional ? 'ADDITIONAL' : 'NORMAL',
        calculation,
      });
      return new Prisma.Decimal(familyReliefs.familyReliefs)
        .plus(calculation.total)
        .toFixed(2);
    },
  );
  return {
    ...result,
    sourceSha256: PCB_SOURCE_SHA256,
    reliefTrace: {
      family: familyReliefs,
      expenses: expenseTraces,
      reliefsApplied: family.residency === 'RESIDENT',
    },
  };
}
