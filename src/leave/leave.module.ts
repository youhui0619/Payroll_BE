import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.module';
import { PageDto } from '../common/page.dto';
import { DecisionDto } from '../common/domain';
import {
  LeaveDto,
  LeavePolicyDto,
  GrantDto,
  LeaveBalanceQueryDto,
  LeaveBalanceResponseDto,
} from './leave.dto';
import { LeaveService } from './leave.service';
@ApiBearerAuth()
@ApiTags('leave')
@Controller('leave')
export class LeaveController {
  constructor(private service: LeaveService) {}
  @Get('policies') policies(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.policies(r.membership, q);
  }
  @Post('policies') @Roles('OWNER', 'HR') policy(
    @Req() r: TenantRequest,
    @Body() d: LeavePolicyDto,
  ) {
    return this.service.createPolicy(r.membership, d);
  }
  @Post('grants') @Roles('OWNER', 'HR') grant(
    @Req() r: TenantRequest,
    @Body() d: GrantDto,
  ) {
    return this.service.grant(r.membership, d);
  }
  @Get('me/balances')
  @ApiOkResponse({ type: LeaveBalanceResponseDto })
  @ApiOperation({
    summary: 'Read posted, reserved and available leave for one calendar year.',
  })
  balances(@Req() r: TenantRequest, @Query() q: LeaveBalanceQueryDto) {
    return this.service.balance(r.membership, q);
  }
  @Get('employees/:id/balances')
  @Roles('OWNER', 'HR')
  @ApiOkResponse({ type: LeaveBalanceResponseDto })
  @ApiOperation({
    summary: 'Read an employee leave balance in the authenticated company.',
  })
  employeeBalances(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: LeaveBalanceQueryDto,
  ) {
    return this.service.balance(r.membership, q, id);
  }
  @Get('applications/:id')
  @ApiOperation({
    summary: 'Read a leave application and retained reviewer decisions.',
  })
  detail(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(r.membership, id);
  }
  @Put('applications/:id')
  @ApiOperation({
    summary: 'Replace an employee-owned draft; eligibility is recalculated.',
  })
  edit(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: LeaveDto,
  ) {
    return this.service.edit(r.membership, id, d);
  }
  @Get('me/applications') own(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.list(r.membership, q);
  }
  @Get('applications') @Roles('OWNER', 'HR') all(
    @Req() r: TenantRequest,
    @Query() q: PageDto,
  ) {
    return this.service.list(r.membership, q, true);
  }
  @Get('pending') pending(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.pending(r.membership, q);
  }
  @Post('applications') create(@Req() r: TenantRequest, @Body() d: LeaveDto) {
    return this.service.create(r.membership, d);
  }
  @Post('applications/:id/submit')
  @ApiOperation({
    summary:
      'Submit leave and freeze eligible working dates for approval and payroll',
    description:
      'Saves daySnapshot with version, schedule, location and date/quantity rows. Submission, decisions and non-draft cancellation cannot affect calculated/finalized payroll months.',
  })
  submit(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.submit(r.membership, id);
  }
  @Post('applications/:id/decision') decide(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.service.decide(r.membership, id, d);
  }
  @Post('applications/:id/cancel') cancel(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(r.membership, id);
  }
}
@Module({ controllers: [LeaveController], providers: [LeaveService] })
export class LeaveModule {}
