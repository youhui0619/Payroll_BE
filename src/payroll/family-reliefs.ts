import { Prisma } from '@prisma/client';
import { fail } from '../common/domain';
import { PCB_SOURCE, PCB_SOURCE_SHA256 } from './pcb-calculator';

export type ChildReliefKind =
  'STANDARD' | 'HIGHER_EDUCATION' | 'DISABLED' | 'DISABLED_HIGHER_EDUCATION';
export interface FamilyReliefInput {
  year: number;
  residency: 'RESIDENT' | 'NON_RESIDENT';
  category: 1 | 2 | 3;
  disabledIndividual: boolean;
  spouseReliefEligible: boolean;
  disabledSpouseReliefEligible: boolean;
  children: {
    reference: string;
    kind: ChildReliefKind;
    share: 'FULL' | 'HALF';
  }[];
}
const childAmounts: Record<ChildReliefKind, number> = {
  STANDARD: 2000,
  HIGHER_EDUCATION: 8000,
  DISABLED: 8000,
  DISABLED_HIGHER_EDUCATION: 16000,
};
/** Eligibility is a reviewed declaration; amounts are determined here, never
 * accepted as arbitrary family relief totals from a caller. TP1 is separate. */
export function calculateFamilyReliefs(input: FamilyReliefInput) {
  if (
    input.year !== 2026 ||
    !['RESIDENT', 'NON_RESIDENT'].includes(input.residency) ||
    ![1, 2, 3].includes(input.category)
  )
    fail(
      'INVALID_TAX_PROFILE',
      'This family relief version supports standard 2026 resident/non-resident categories only.',
      400,
    );
  if (
    [
      'disabledIndividual',
      'spouseReliefEligible',
      'disabledSpouseReliefEligible',
    ].some((k) => typeof input[k] !== 'boolean') ||
    !Array.isArray(input.children) ||
    input.children.length > 50
  )
    fail(
      'INVALID_TAX_PROFILE',
      'Provide explicit eligibility flags and at most 50 child declarations.',
      400,
    );
  if (
    (input.spouseReliefEligible && input.category !== 2) ||
    (input.category === 1 &&
      (input.children.length || input.disabledSpouseReliefEligible))
  )
    fail(
      'TAX_CATEGORY_MISMATCH',
      'Family declarations conflict with the PCB category.',
      400,
    );
  const references = new Set<string>();
  const resident = input.residency === 'RESIDENT';
  const children = input.children.map((child) => {
    const reference = child?.reference?.trim();
    if (
      !reference ||
      reference.length > 100 ||
      references.has(reference) ||
      !Object.prototype.hasOwnProperty.call(childAmounts, child.kind) ||
      !['FULL', 'HALF'].includes(child.share)
    )
      fail(
        'INVALID_CHILD_RELIEF',
        'Child references must be unique and classifications/shares supported.',
        400,
      );
    references.add(reference);
    const amount = new Prisma.Decimal(
      resident ? childAmounts[child.kind] : 0,
    ).mul(child.share === 'HALF' ? '0.5' : '1');
    return { ...child, reference, amount: amount.toFixed(2) };
  });
  const individual = new Prisma.Decimal(resident ? 9000 : 0);
  const spouse = new Prisma.Decimal(
    resident && input.spouseReliefEligible ? 4000 : 0,
  );
  const disabledIndividual = new Prisma.Decimal(
    resident && input.disabledIndividual ? 7000 : 0,
  );
  const disabledSpouse = new Prisma.Decimal(
    resident && input.disabledSpouseReliefEligible ? 6000 : 0,
  );
  const childTotal = children.reduce(
    (sum, child) => sum.plus(child.amount),
    new Prisma.Decimal(0),
  );
  return {
    individual: individual.toFixed(2),
    spouse: spouse.toFixed(2),
    disabledIndividual: disabledIndividual.toFixed(2),
    disabledSpouse: disabledSpouse.toFixed(2),
    children,
    childTotal: childTotal.toFixed(2),
    familyReliefs: individual
      .plus(spouse)
      .plus(disabledIndividual)
      .plus(disabledSpouse)
      .plus(childTotal)
      .toFixed(2),
    sourceUrl: PCB_SOURCE,
    sourceSha256: PCB_SOURCE_SHA256,
    shareReference: 'https://ef.hasil.gov.my/eBE2026/Pdf/Nota_BE.pdf',
    limitations: [
      'Declared eligibility must be reviewed against supporting documents, including education, disability and spouse income/assessment conditions.',
      'Half share is for qualifying shared claims; it is not an automatic split between spouses living together.',
      'Family reliefs exclude EPF and TP1 expense deductions; this is not the final combined PCB relief input.',
    ],
  };
}
