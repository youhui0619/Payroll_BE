import { Module } from '@nestjs/common';
import { TaxExpensesController } from './tax-expenses.controller';
import { TaxExpensesService } from './tax-expenses.service';

@Module({
  controllers: [TaxExpensesController],
  providers: [TaxExpensesService],
})
export class TaxExpensesModule {}
