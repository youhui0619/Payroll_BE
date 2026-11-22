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
  CommissionAllocationDto,
  CommissionAllocationResponseDto,
  CommissionAllocationHistoryDto,
} from './commission-allocation.dto';
import { CommissionAllocationService } from './commission-allocation.service';

@ApiBearerAuth()
@ApiTags('payroll-commissions')
@Roles('OWNER', 'FINANCE')
@Controller('payroll')
export class CommissionAllocationController {
  constructor(private service: CommissionAllocationService) {}
  @Post('runs/:runId/commissions/:recordId/allocate')
  @ApiCreatedResponse({ type: CommissionAllocationResponseDto })
  @ApiOperation({
    summary: 'Allocate a ready commission to one draft payroll run',
    description:
      'Uses the record earning code and saved payout timing. CURRENT_PAYROLL permits its creation month or later; NEXT_PAYROLL permits the following month or later. SEPARATE_PAYOUT is excluded. Status remains READY_FOR_PAYROLL.',
  })
  allocate(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() d: CommissionAllocationDto,
  ) {
    return this.service.change(r.membership, runId, recordId, d, true);
  }
  @Post('runs/:runId/commissions/:recordId/release')
  @ApiCreatedResponse({ type: CommissionAllocationResponseDto })
  release(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() d: CommissionAllocationDto,
  ) {
    return this.service.change(r.membership, runId, recordId, d, false);
  }
  @Get('commissions/:recordId/allocation-history')
  @ApiOkResponse({ type: CommissionAllocationHistoryDto })
  history(
    @Req() r: TenantRequest,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Query() q: PageDto,
  ) {
    return this.service.history(r.membership, recordId, q);
  }
}
