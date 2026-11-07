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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.module';
import { PageDto } from '../common/page.dto';
import {
  CreatePayrollDto,
  PayrollProfileDto,
  PayrollSettingsDto,
  PayrollProfileHistoryDto,
  PayrollProfileResponseDto,
} from './payroll.dto';
import { PayrollService } from './payroll.service';
import { ComponentDefinitionsModule } from './component-definitions.module';
import { PayrollInputsModule } from './payroll-inputs.module';
import { InputPreviewService } from './input-preview.service';
import { InputPreviewResponseDto } from './input-preview.dto';
import { ClaimAllocationModule } from './claim-allocation.module';
import { TaxOpeningsModule } from './tax-openings.module';
import { TaxFamilyModule } from './tax-family.module';
import { TaxExpensesModule } from './tax-expenses.module';

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
      'Requires BASIC earning definition and, when applicable, UNPAID_LEAVE deduction definition with matching statutory bases. Includes allocated approved claims. Returns wage bases, source traces and non-PCB contribution previews using effective profile categories and active rulesets. Missing rules appear as issues. PCB, final net and overtime remain pending; no calculation is persisted.',
  })
  inputPreview(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.inputs.preview(r.membership, id, employeeId);
  }
  @Get('payroll/settings') settings(@Req() r: TenantRequest) {
    return this.service.settings(r.membership);
  }
  @Put('payroll/settings') @Roles('OWNER') saveSettings(
    @Req() r: TenantRequest,
    @Body() d: PayrollSettingsDto,
  ) {
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
  @Put('employees/:id/payroll-profile')
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

@Module({
  imports: [
    ComponentDefinitionsModule,
    PayrollInputsModule,
    ClaimAllocationModule,
    TaxOpeningsModule,
    TaxFamilyModule,
    TaxExpensesModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService, InputPreviewService],
})
export class PayrollModule {}
