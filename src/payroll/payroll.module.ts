import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { ComponentDefinitionsModule } from './component-definitions.module';
import { PayrollInputsModule } from './payroll-inputs.module';
import { InputPreviewService } from './input-preview.service';
import { ClaimAllocationModule } from './claim-allocation.module';
import { TaxOpeningsModule } from './tax-openings.module';
import { TaxFamilyModule } from './tax-family.module';
import { TaxExpensesModule } from './tax-expenses.module';
import { PayrollController } from './payroll.controller';
import { PayrollRosterController } from './payroll-roster.controller';
import { PayrollRosterService } from './payroll-roster.service';
import { CalculationPreviewController } from './calculation-preview.controller';
import { CalculationPreviewService } from './calculation-preview.service';
import { CommissionAllocationController } from './commission-allocation.controller';
import { CommissionAllocationService } from './commission-allocation.service';

@Module({
  imports: [
    ComponentDefinitionsModule,
    PayrollInputsModule,
    ClaimAllocationModule,
    TaxOpeningsModule,
    TaxFamilyModule,
    TaxExpensesModule,
  ],
  controllers: [
    PayrollController,
    PayrollRosterController,
    CalculationPreviewController,
    CommissionAllocationController,
  ],
  providers: [
    PayrollService,
    InputPreviewService,
    PayrollRosterService,
    CalculationPreviewService,
    CommissionAllocationService,
  ],
})
export class PayrollModule {}
