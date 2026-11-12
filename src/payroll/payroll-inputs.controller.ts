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
  PayrollInputDto,
  VoidPayrollInputDto,
  PayrollInputResponse,
  PayrollInputsResponse,
} from './payroll-inputs.dto';
import { PayrollInputsService } from './payroll-inputs.service';

@ApiBearerAuth()
@ApiTags('payroll-inputs')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs/:runId/inputs')
export class PayrollInputsController {
  constructor(private service: PayrollInputsService) {}
  @Post()
  @ApiCreatedResponse({ type: PayrollInputResponse })
  @ApiOperation({
    summary:
      'Add a retained manual input to a draft; resolve component flags at calculation time',
  })
  create(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() d: PayrollInputDto,
  ) {
    return this.service.create(r.membership, runId, d);
  }
  @Get()
  @ApiOkResponse({ type: PayrollInputsResponse })
  @ApiOperation({ summary: 'List manual inputs including voided history' })
  list(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query() q: PageDto,
  ) {
    return this.service.list(r.membership, runId, q);
  }
  @Post(':id/void')
  @ApiCreatedResponse({ type: PayrollInputResponse })
  void(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: VoidPayrollInputDto,
  ) {
    return this.service.void(r.membership, runId, id, d);
  }
}
