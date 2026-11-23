import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { PageDto } from '../common/page.dto';
import {
  PayrollAdjustmentDto,
  PayrollAdjustmentResponse,
  PayrollAdjustmentVoidDto,
  PayrollAdjustmentsResponse,
} from './payroll-adjustments.dto';
import { PayrollAdjustmentsService } from './payroll-adjustments.service';

@ApiBearerAuth()
@ApiTags('payroll-adjustments')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs/:runId/adjustments')
export class PayrollAdjustmentsController {
  constructor(private service: PayrollAdjustmentsService) {}
  @Post()
  @ApiCreatedResponse({ type: PayrollAdjustmentResponse })
  @ApiOperation({
    summary: 'Apply a finalized payroll correction to a later draft run',
  })
  create(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() d: PayrollAdjustmentDto,
  ) {
    return this.service.create(r.membership, runId, d);
  }
  @Get()
  @ApiOkResponse({ type: PayrollAdjustmentsResponse })
  @ApiOperation({ summary: 'List corrections assigned to a later payroll run' })
  list(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query() q: PageDto,
  ) {
    return this.service.list(r.membership, runId, q);
  }
  @Post(':id/void')
  @ApiCreatedResponse({ type: PayrollAdjustmentResponse })
  @ApiOperation({
    summary: 'Void a correction before the target run is finalized',
  })
  void(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PayrollAdjustmentVoidDto,
  ) {
    return this.service.void(r.membership, runId, id, d);
  }
}
