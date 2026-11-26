import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { PageDto } from '../common/page.dto';
import {
  EmployeeAccountsService,
  CreateEmployeeAccountDto,
} from './employee-accounts.service';
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
  SalaryDto,
  EmployeeLifecycleDto,
} from './employees.dto';
import { EmployeeImportDto } from './employee-import.dto';
import { EmployeesService } from './employees.service';
import { AccountTokensService } from '../auth/account-tokens.service';
import { InviteEmployeeAccountDto } from '../auth/account-tokens.dto';
import { AttendanceCalendarQueryDto } from '../attendance/attendance.dto';
import { AttendanceService } from '../attendance/attendance.service';

@ApiBearerAuth()
@ApiTags('employees')
@Roles('OWNER', 'HR')
@Controller('employees')
export class EmployeesController {
  constructor(
    private service: EmployeesService,
    private accounts: EmployeeAccountsService,
    private accountTokens: AccountTokensService,
    private attendance: AttendanceService,
  ) {}
  @Get('me') @Roles('OWNER', 'HR', 'FINANCE', 'EMPLOYEE') me(
    @Req() req: TenantRequest,
  ) {
    return this.accounts.me(req.membership.companyId, req.membership.id);
  }
  @Post(':id/account') createAccount(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEmployeeAccountDto,
  ) {
    return this.accounts.create(req.membership.companyId, id, dto);
  }
  @Post(':id/account/invite') inviteAccount(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteEmployeeAccountDto,
  ) {
    return this.accountTokens.invite(req.membership, id, dto);
  }
  @Get() list(@Req() req: TenantRequest, @Query() q: EmployeeQueryDto) {
    return this.service.list(req.membership.companyId, q);
  }
  @Get('export.csv') @Roles('OWNER', 'HR', 'FINANCE') export(
    @Req() req: TenantRequest,
    @Query() q: EmployeeQueryDto,
    @Res() res: Response,
  ) {
    return this.service
      .exportCsv(req.membership, q)
      .then((content) =>
        res.type('text/csv').attachment('employees.csv').send(content),
      );
  }
  @Get('managers') managers(@Req() req: TenantRequest, @Query() q: PageDto) {
    return this.service.managers(req.membership.companyId, q);
  }
  @Post('import/preview') importPreview(
    @Req() req: TenantRequest,
    @Body() dto: EmployeeImportDto,
  ) {
    return this.service.importPreview(req.membership.companyId, dto);
  }
  @Post('import/commit') importCommit(
    @Req() req: TenantRequest,
    @Body() dto: EmployeeImportDto,
  ) {
    return this.service.importCommit(req.membership, dto);
  }
  @Get(':id/calendar') calendar(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: AttendanceCalendarQueryDto,
  ) {
    return this.attendance.employeeCalendar(req.membership, id, q);
  }
  @Get(':id') get(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(req.membership.companyId, id);
  }
  @Post() create(@Req() req: TenantRequest, @Body() dto: CreateEmployeeDto) {
    return this.service.create(req.membership.companyId, dto);
  }
  @Patch(':id') update(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.update(req.membership.companyId, id, dto);
  }
  @Post(':id/activate') activate(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.service.lifecycle(req.membership, id, 'ACTIVATE', dto);
  }
  @Post(':id/confirm') confirm(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.service.lifecycle(req.membership, id, 'CONFIRM', dto);
  }
  @Post(':id/resign') resign(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.service.lifecycle(req.membership, id, 'RESIGN', dto);
  }
  @Post(':id/terminate') terminate(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.service.lifecycle(req.membership, id, 'TERMINATE', dto);
  }
  @Post(':id/archive') archive(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeLifecycleDto,
  ) {
    return this.service.lifecycle(req.membership, id, 'ARCHIVE', dto);
  }
  @Get(':id/salaries') @Roles('OWNER', 'HR', 'FINANCE') salaries(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.salaries(req.membership.companyId, id, q);
  }
  @Post(':id/salaries') @Roles('OWNER', 'HR') addSalary(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryDto,
  ) {
    return this.service.addSalary(req.membership.companyId, id, dto);
  }
}
