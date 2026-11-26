import { Module } from '@nestjs/common';
import { EmployeeAccountsService } from './employee-accounts.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { AuthModule } from '../auth/auth.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [AuthModule, AttendanceModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeAccountsService],
})
export class EmployeesModule {}
