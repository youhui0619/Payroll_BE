import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { PageDto } from '../common/page.dto';
import {
  CreatePayrollDto,
  PayrollProfileDto,
  PayrollSettingsDto,
  PayrollSettingsResponseDto,
  PayrollProfileHistoryDto,
  PayrollProfileResponseDto,
} from './payroll.dto';
import { PayrollService } from './payroll.service';
import { InputPreviewService } from './input-preview.service';
import { InputPreviewResponseDto } from './input-preview.dto';

@ApiBearerAuth()
@ApiTags('payroll')
@Roles('OWNER', 'FINANCE')
@Controller()
export class PayrollController {
  constructor(
    private service: PayrollService,
    private inputs: InputPreviewService,
  ) {}
  @Get('payroll/runs/:id/employees/:employeeId/input-preview')
  @ApiOkResponse({ type: InputPreviewResponseDto })
  @ApiOperation({
    summary:
      'Preview resolved salary, unpaid leave and manual inputs for one draft-run employee',
    description:
      'Requires BASIC earning definition and, when applicable, UNPAID_LEAVE deduction definition with matching statutory bases. Includes allocated approved claims, commissions and overtime. Returns wage bases, source traces and non-PCB contribution previews using effective profile categories and active rulesets. Missing rules appear as issues; no calculation is persisted.',
  })
  inputPreview(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.inputs.preview(r.membership, id, employeeId);
  }
  @Get('payroll/settings')
  @ApiOkResponse({ type: PayrollSettingsResponseDto })
  @ApiOperation({
    summary:
      'Read payroll configuration using FE-compatible day and rate types',
  })
  settings(@Req() r: TenantRequest) {
    return this.service.settings(r.membership);
  }
  @Patch('payroll/settings')
  @Roles('OWNER')
  @ApiOkResponse({ type: PayrollSettingsResponseDto })
  @ApiOperation({
    summary: 'Save payroll configuration',
    description:
      'Days are integers 1–31 or LAST_DAY. Legacy cutoffDay/payDay inputs remain supported. Nullable overtime values and empty unconfigured earning codes may be saved; calculation readiness is checked separately.',
  })
  saveSettings(@Req() r: TenantRequest, @Body() d: PayrollSettingsDto) {
    return this.service.saveSettings(r.membership, d);
  }
  @Get('employees/:id/payroll-profile')
  @Roles('OWNER', 'HR', 'FINANCE')
  @ApiOperation({
    summary:
      'Read the latest recorded profile revision, including future scheduled changes',
  })
  @ApiOkResponse({ type: PayrollProfileResponseDto })
  profile(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.profile(r.membership, id);
  }
  @Patch('employees/:id/payroll-profile')
  @Roles('OWNER', 'HR')
  @ApiOkResponse({ type: PayrollProfileResponseDto })
  @ApiOperation({
    summary: 'Append an effective-month category and participation revision',
  })
  saveProfile(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PayrollProfileDto,
  ) {
    return this.service.saveProfile(r.membership, id, d);
  }
  @Put('employees/:id/payroll-profile')
  @Roles('OWNER', 'HR')
  @ApiOkResponse({ type: PayrollProfileResponseDto })
  @ApiOperation({
    summary: 'Append a payroll profile revision (PUT compatibility route)',
  })
  saveProfilePut(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PayrollProfileDto,
  ) {
    return this.service.saveProfile(r.membership, id, d);
  }
  @Get('employees/:id/payroll-profile/history')
  @Roles('OWNER', 'HR', 'FINANCE')
  @ApiOperation({
    summary:
      'Read immutable category and participation revisions, newest first',
  })
  @ApiOkResponse({ type: PayrollProfileHistoryDto })
  profileHistory(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.profileHistory(r.membership, id, q);
  }
  @Post('payroll/runs') create(
    @Req() r: TenantRequest,
    @Body() d: CreatePayrollDto,
  ) {
    return this.service.create(r.membership, d);
  }
  @Get('payroll/runs') list(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.list(r.membership, q);
  }
  @Get('payroll/runs/:id') detail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(r.membership, id);
  }
  @Get('payroll/runs/:id/preflight')
  @ApiOperation({
    summary:
      'Report setup gaps; calculation remains unavailable until statutory and payroll engines are implemented.',
  })
  preflight(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.preflight(r.membership, id);
  }
}
