import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { DatabaseModule } from './database.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationModule } from './organization/organization.module';
import { EmployeesModule } from './employees/employees.module';
import { WorkforceModule } from './workforce/workforce.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { ClaimsModule } from './claims/claims.module';
import { HealthController } from './health.controller';
import { FilesModule } from './files/files.module';
import { RulesModule } from './payroll/rules.module';
import { ReportsModule } from './reports/reports.module';
import { PayrollModule } from './payroll/payroll.module';
import { MembershipsModule } from './auth/memberships.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    OrganizationModule,
    EmployeesModule,
    WorkforceModule,
    AttendanceModule,
    LeaveModule,
    ClaimsModule,
    FilesModule,
    RulesModule,
    ReportsModule,
    PayrollModule,
    MembershipsModule,
  ],
  controllers: [HealthController],
  providers: [AppService],
})
export class AppModule {}
