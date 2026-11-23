import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { PageDto } from '../common/page.dto';
import { DecisionDto } from '../common/domain';
import {
  ClaimTypeDto,
  ClaimDto,
  PayClaimDto,
  ClaimQueryDto,
} from './claims.dto';
import { ClaimsService } from './claims.service';

@ApiBearerAuth()
@ApiTags('claims')
@Controller('claims')
export class ClaimsController {
  constructor(private service: ClaimsService) {}
  @Get('types') types(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.types(r.membership, q);
  }
  @Get('types/:id') typeDetail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.type(r.membership, id);
  }
  @Post('types') @Roles('OWNER', 'HR', 'FINANCE') type(
    @Req() r: TenantRequest,
    @Body() d: ClaimTypeDto,
  ) {
    return this.service.createType(r.membership, d);
  }
  @Post() create(@Req() r: TenantRequest, @Body() d: ClaimDto) {
    return this.service.create(r.membership, d);
  }
  @Patch('types/:id')
  @Roles('OWNER', 'HR', 'FINANCE')
  @ApiOperation({
    summary:
      'Replace claim type settings; submitted claims retain their policy snapshot.',
  })
  updateType(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ClaimTypeDto,
  ) {
    return this.service.updateType(r.membership, id, d);
  }
  @Post('types/:id/deactivate')
  @Roles('OWNER', 'HR', 'FINANCE')
  deactivateType(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivateType(r.membership, id);
  }
  @Get('me') own(@Req() r: TenantRequest, @Query() q: ClaimQueryDto) {
    return this.service.list(r.membership, q, 'own');
  }
  @Get() @Roles('OWNER', 'HR', 'FINANCE') all(
    @Req() r: TenantRequest,
    @Query() q: ClaimQueryDto,
  ) {
    return this.service.list(r.membership, q, 'all');
  }
  @Get('pending') pending(@Req() r: TenantRequest, @Query() q: ClaimQueryDto) {
    return this.service.list(r.membership, q, 'pending');
  }
  @Post(':id/submit') submit(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.submit(r.membership, id);
  }
  @Get(':id')
  @ApiOperation({
    summary: 'Read a claim, receipts and complete decision history.',
  })
  detail(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(r.membership, id);
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Replace an employee-owned draft claim.' })
  edit(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ClaimDto,
  ) {
    return this.service.edit(r.membership, id, d);
  }
  @Post(':id/decision') decide(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.service.decide(r.membership, id, d);
  }
  @Post(':id/cancel') cancel(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(r.membership, id);
  }
  @Post(':id/pay') @Roles('OWNER', 'FINANCE') pay(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PayClaimDto,
  ) {
    return this.service.pay(r.membership, id, d);
  }
}
