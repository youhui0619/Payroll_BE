import { Module } from '@nestjs/common';
import { EmployeeAccountsService } from './employee-accounts.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeAccountsService],
})
export class EmployeesModule {}
