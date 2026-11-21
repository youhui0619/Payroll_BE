import { Injectable } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { fail } from '../common/domain';
import { InputPreviewService } from './input-preview.service';
import { CalculationPreviewDto } from './calculation-preview.dto';
import { calculateDeclaredPcb } from './declared-pcb';
import { FamilyReliefInput } from './family-reliefs';
import { Tp1Code } from './tp1-reliefs';
import { payrollTotals } from './payroll-calculator';
import { TaxPeriodSnapshot } from './tax-ytd';
import { PCB_SOURCE_SHA256 } from './pcb-calculator';

@Injectable()
export class CalculationPreviewService {
  constructor(
    private db: Database,
    private inputs: InputPreviewService,
  ) {}

  async preview(
    m: Membership,
    runId: string,
    employeeId: string,
    d: CalculationPreviewDto,
  ) {
    if (d.taxRegime !== 'STANDARD' || !d.zakatEvidence.trim())
      fail(
        'TAX_REVIEW_REQUIRED',
        'Confirm the standard tax regime and provide a zakat review reference.',
        400,
      );
    return this.db.$transaction(
      async (tx) => {
        const { data: input } = await this.inputs.resolve(
          tx,
          m,
          runId,
          employeeId,
        );
        if (!input.contributionPreview.nonPcbReady || !input.epfAllocation)
          fail(
            'STATUTORY_INPUTS_INCOMPLETE',
            'Resolve contribution rules, participation and EPF classifications before calculation.',
            409,
          );
        if (!input.taxYtd.ready)
          fail(
            'TAX_YTD_INCOMPLETE',
            'Resolve all prior payroll tax history issues before calculation.',
            409,
          );
        if (!input.taxOpening || !input.taxFamily || !input.taxExpenses)
          fail(
            'TAX_DECLARATIONS_REQUIRED',
            'Record previous-employer, family and TP1 declarations, including reviewed zero declarations where applicable.',
            409,
          );
        if (new Prisma.Decimal(input.pcbRemuneration.unclassified).gt(0))
          fail(
            'PCB_CLASSIFICATION_REQUIRED',
            'Classify every taxable remuneration line before calculation.',
            409,
          );
        const family = input.taxFamily
          .declaration as unknown as FamilyReliefInput;
        if (
          !['RESIDENT', 'NON_RESIDENT'].includes(input.pcbCategory ?? '') ||
          input.pcbCategory !== family.residency
        )
          fail(
            'PCB_CATEGORY_UNSUPPORTED',
            'Standard calculation requires a RESIDENT or NON_RESIDENT payroll profile category matching the family declaration.',
            409,
          );
        const accumulated = (
          field: 'taxableIncome' | 'employeeEpf' | 'mtd' | 'zakat',
        ) =>
          new Prisma.Decimal(input.taxYtd.totals[field])
            .plus(input.taxOpening![field])
            .toFixed(2);
        const pcb = calculateDeclaredPcb(
          {
            year: input.year,
            month: input.month,
            normal: input.pcbRemuneration.normal,
            additional: input.pcbRemuneration.additional,
            normalEpf: input.epfAllocation.normalEpf,
            additionalEpf: input.epfAllocation.additionalEpf,
            accumulatedIncome: accumulated('taxableIncome'),
            accumulatedEpf: accumulated('employeeEpf'),
            accumulatedMtd: accumulated('mtd'),
            accumulatedZakat: accumulated('zakat'),
            currentZakat: d.currentZakat,
          },
          family,
          input.taxExpenses.amounts as Partial<Record<Tp1Code, string>>,
        );
        const totals = payrollTotals(input.lines, [
          ...input.contributionPreview.contributions,
          {
            scheme: 'PCB',
            rulesetId: 'PCB_2026:' + PCB_SOURCE_SHA256,
            version: 'PCB_2026_V1',
            result: {
              employee: pcb.amount,
              employer: '0.00',
              total: pcb.amount,
              basis: input.bases.PCB,
              trace: {
                ...pcb.trace,
                reliefTrace: pcb.reliefTrace,
                sourceSha256: pcb.sourceSha256,
              },
            },
          },
        ]);
        const taxPeriod: TaxPeriodSnapshot = {
          version: 1,
          companyId: m.companyId,
          employeeId,
          runId,
          year: input.year,
          month: input.month,
          taxableIncome: input.bases.PCB,
          employeeEpf: input.epfAllocation.totalEmployeeEpf,
          mtd: pcb.amount,
          zakat: new Prisma.Decimal(d.currentZakat).toFixed(2),
        };
        return {
          data: {
            input,
            pcb,
            totals,
            taxPeriod,
            taxReview: {
              taxRegime: d.taxRegime,
              currentZakat: taxPeriod.zakat,
              zakatEvidence: d.zakatEvidence.trim(),
              reviewedBy: m.userId,
            },
            previewOnly: true,
            complete: false,
            limitations: [
              'No calculation or status change is persisted.',
              'Uses the current calendar-month input engine; other proration methods and all company inclusion switches are not yet applied.',
              'Unallocated claims, overtime and recurring allowances are not automatically collected. Zakat credit does not create a salary deduction.',
            ],
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
