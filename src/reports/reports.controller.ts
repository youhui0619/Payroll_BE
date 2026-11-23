import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { DateRangeDto } from '../workforce/workforce.dto';
import { PayslipHistoryQueryDto, ReportYearQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiBearerAuth()
@ApiTags('reports')
@Roles('OWNER', 'HR', 'FINANCE')
@Controller()
export class ReportsController {
  constructor(private service: ReportsService) {}
  @Get('dashboard') dashboard(@Req() r: TenantRequest) {
    return this.service.dashboard(r.membership);
  }
  @Get('reports/attendance.csv') @Roles('OWNER', 'HR') async attendance(
    @Req() r: TenantRequest,
    @Query() q: DateRangeDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment('attendance.csv')
      .send(await this.service.attendance(r.membership, q));
  }
  @Get('reports/claims.csv') async claims(
    @Req() r: TenantRequest,
    @Query() q: DateRangeDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment('claims.csv')
      .send(await this.service.claims(r.membership, q));
  }
  @Get('reports/leave-balances.csv') async leaveBalances(
    @Req() r: TenantRequest,
    @Query() q: ReportYearQueryDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment(`leave-balances-${q.year ?? 'current'}.csv`)
      .send(await this.service.leaveBalances(r.membership, q));
  }
  @Get('reports/leave-applications.csv') async leaveApplications(
    @Req() r: TenantRequest,
    @Query() q: DateRangeDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment('leave-applications.csv')
      .send(await this.service.leaveApplications(r.membership, q));
  }
  @Get('reports/payslip-history.csv') async payslipHistory(
    @Req() r: TenantRequest,
    @Query() q: PayslipHistoryQueryDto,
    @Res() res: Response,
  ) {
    res
      .type('text/csv')
      .attachment('payslip-history.csv')
      .send(await this.service.payslipHistory(r.membership, q));
  }
}
