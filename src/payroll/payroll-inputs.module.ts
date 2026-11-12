import { Module } from '@nestjs/common';
import { PayrollInputsController } from './payroll-inputs.controller';
import { PayrollInputsService } from './payroll-inputs.service';

@Module({
  controllers: [PayrollInputsController],
  providers: [PayrollInputsService],
})
export class PayrollInputsModule {}
