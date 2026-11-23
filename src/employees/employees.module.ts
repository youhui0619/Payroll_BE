import { Module } from '@nestjs/common';
import { EmployeeAccountsService } from './employee-accounts.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeAccountsService],
})
export class EmployeesModule {}
