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

@Module({
  imports: [
    ComponentDefinitionsModule,
    PayrollInputsModule,
    ClaimAllocationModule,
    TaxOpeningsModule,
    TaxFamilyModule,
    TaxExpensesModule,
  ],
  controllers: [PayrollController, PayrollRosterController],
  providers: [PayrollService, InputPreviewService, PayrollRosterService],
})
export class PayrollModule {}
