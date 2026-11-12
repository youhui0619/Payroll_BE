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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { PageDto } from '../common/page.dto';
import {
  EmployeeAccountsService,
  CreateEmployeeAccountDto,
} from './employee-accounts.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  SalaryDto,
} from './employees.dto';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@ApiTags('employees')
@Roles('OWNER', 'HR')
@Controller('employees')
export class EmployeesController {
  constructor(
    private service: EmployeesService,
    private accounts: EmployeeAccountsService,
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
  @Get() list(@Req() req: TenantRequest, @Query() q: PageDto) {
    return this.service.list(req.membership.companyId, q);
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
