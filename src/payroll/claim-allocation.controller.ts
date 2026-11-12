import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import {
  ClaimAllocationReasonDto,
  ClaimAllocationDto,
  ClaimAllocationResponseDto,
} from './claim-allocation.dto';
import { ClaimAllocationService } from './claim-allocation.service';

@ApiBearerAuth()
@ApiTags('payroll-claims')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs/:runId/claims/:claimId')
export class ClaimAllocationController {
  constructor(private service: ClaimAllocationService) {}
  @Post('allocate')
  @ApiCreatedResponse({ type: ClaimAllocationResponseDto })
  @ApiOperation({
    summary:
      'Allocate an approved PAYROLL claim to one draft run and earning definition',
  })
  allocate(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() d: ClaimAllocationDto,
  ) {
    return this.service.change(
      r.membership,
      runId,
      claimId,
      d,
      d.componentCode,
    );
  }
  @Post('release')
  @ApiCreatedResponse({ type: ClaimAllocationResponseDto })
  @ApiOperation({
    summary:
      'Release a draft-run allocation; retain the claim decision and allocation history',
  })
  release(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() d: ClaimAllocationReasonDto,
  ) {
    return this.service.change(r.membership, runId, claimId, d);
  }
}
