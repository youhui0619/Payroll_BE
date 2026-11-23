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
  OvertimeAllocationDto,
  OvertimeAllocationHistoryDto,
  OvertimeAllocationResponseDto,
} from './overtime-allocation.dto';
import { OvertimeAllocationService } from './overtime-allocation.service';

@ApiBearerAuth()
@ApiTags('payroll-overtime')
@Roles('OWNER', 'FINANCE')
@Controller('payroll')
export class OvertimeAllocationController {
  constructor(private service: OvertimeAllocationService) {}

  @Post('runs/:runId/overtime/:requestId/allocate')
  @ApiCreatedResponse({ type: OvertimeAllocationResponseDto })
  @ApiOperation({
    summary: 'Allocate an approved overtime request to one draft payroll run',
    description:
      'The saved overtime earning code, multiplier and employee overtime basis are retained. Allocation does not change the approval status.',
  })
  allocate(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() d: OvertimeAllocationDto,
  ) {
    return this.service.change(r.membership, runId, requestId, d, true);
  }

  @Post('runs/:runId/overtime/:requestId/release')
  @ApiCreatedResponse({ type: OvertimeAllocationResponseDto })
  release(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() d: OvertimeAllocationDto,
  ) {
    return this.service.change(r.membership, runId, requestId, d, false);
  }

  @Get('overtime/:requestId/allocation-history')
  @ApiOkResponse({ type: OvertimeAllocationHistoryDto })
  history(
    @Req() r: TenantRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Query() q: PageDto,
  ) {
    return this.service.history(r.membership, requestId, q);
  }
}
