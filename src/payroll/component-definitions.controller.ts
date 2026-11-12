import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
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
  ComponentDefinitionDto,
  ComponentListDto,
  ComponentResponseDto,
  ComponentListResponseDto,
} from './component-definitions.dto';
import { ComponentDefinitionsService } from './component-definitions.service';

@ApiBearerAuth()
@ApiTags('payroll-components')
@Roles('OWNER', 'HR', 'FINANCE')
@Controller('payroll/component-definitions')
export class ComponentDefinitionsController {
  constructor(private service: ComponentDefinitionsService) {}
  @Post()
  @Roles('OWNER')
  @ApiCreatedResponse({ type: ComponentResponseDto })
  @ApiOperation({
    summary:
      'Append a versioned earning/deduction definition; inactive revisions archive the code',
  })
  save(@Req() r: TenantRequest, @Body() d: ComponentDefinitionDto) {
    return this.service.save(r.membership, d);
  }
  @Get()
  @ApiOkResponse({ type: ComponentListResponseDto })
  list(@Req() r: TenantRequest, @Query() q: ComponentListDto) {
    return this.service.list(r.membership, q);
  }
  @Get(':code/history')
  @ApiOkResponse({ type: ComponentListResponseDto })
  history(
    @Req() r: TenantRequest,
    @Param('code') code: string,
    @Query() q: PageDto,
  ) {
    return this.service.history(r.membership, code, q);
  }
}
