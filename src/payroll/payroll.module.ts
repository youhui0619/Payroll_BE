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
import { OvertimeAllocationModule } from './overtime-allocation.module';
import { PayrollExecutionController } from './payroll-execution.controller';
import { PayslipController } from './payslip.controller';
import { PayrollExecutionService } from './payroll-execution.service';
import { PayrollRegisterController } from './payroll-register.controller';

@Module({
  imports: [
    ComponentDefinitionsModule,
    PayrollInputsModule,
    ClaimAllocationModule,
    TaxOpeningsModule,
    TaxFamilyModule,
    TaxExpensesModule,
    OvertimeAllocationModule,
  ],
  controllers: [
    PayrollController,
    PayrollRosterController,
    CalculationPreviewController,
    CommissionAllocationController,
    PayrollExecutionController,
    PayslipController,
    PayrollRegisterController,
  ],
  providers: [
    PayrollService,
    InputPreviewService,
    PayrollRosterService,
    CalculationPreviewService,
    CommissionAllocationService,
    PayrollExecutionService,
  ],
})
export class PayrollModule {}
