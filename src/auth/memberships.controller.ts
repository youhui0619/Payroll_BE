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
import { Roles, TenantRequest } from './auth.decorators';
import {
  CreateMemberDto,
  MembershipQueryDto,
  UpdateMemberDto,
} from './memberships.dto';
import { MembershipsService } from './memberships.service';
import { AccountTokensService } from './account-tokens.service';
import { IssuePasswordResetDto } from './account-tokens.dto';

@ApiBearerAuth()
@ApiTags('memberships')
@Roles('OWNER')
@Controller('memberships')
export class MembershipsController {
  constructor(
    private service: MembershipsService,
    private accountTokens: AccountTokensService,
  ) {}
  @Get() list(@Req() r: TenantRequest, @Query() q: MembershipQueryDto) {
    return this.service.list(r.membership, q);
  }
  @Post() create(@Req() r: TenantRequest, @Body() d: CreateMemberDto) {
    return this.service.create(r.membership, d);
  }
  @Get(':id') get(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(r.membership, id);
  }
  @Patch(':id') update(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateMemberDto,
  ) {
    return this.service.update(r.membership, id, d);
  }

  @Post(':id/password-reset') issuePasswordReset(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: IssuePasswordResetDto,
  ) {
    return this.accountTokens.issuePasswordReset(
      r.membership,
      id,
      d.expiresInHours ?? 1,
    );
  }
}
