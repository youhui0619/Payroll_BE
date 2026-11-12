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
  CatalogResponseDto,
  RulesDto,
  PreviewDto,
  ContributionPreviewResponseDto,
} from './rules.dto';
import { RulesService } from './rules.service';

@ApiBearerAuth()
@ApiTags('statutory-rules')
@Roles('OWNER', 'FINANCE')
@Controller('statutory/rulesets')
export class RulesController {
  constructor(private service: RulesService) {}
  @Get('catalog')
  @ApiOkResponse({ type: CatalogResponseDto })
  @ApiOperation({
    summary: 'List bundled source-backed rules and their limitations',
  })
  catalog() {
    return this.service.catalog();
  }
  @Post('catalog/:key/import')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Import an inactive company draft; duplicate versions return 409',
  })
  importCatalog(@Req() r: TenantRequest, @Param('key') key: string) {
    return this.service.importCatalog(r.membership, key);
  }
  @Get() list(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.list(r.membership, q);
  }
  @Post() create(@Req() r: TenantRequest, @Body() d: RulesDto) {
    return this.service.create(r.membership, d);
  }
  @Post(':id/activate') @Roles('OWNER') activate(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.activate(r.membership, id);
  }
  @Post(':id/preview')
  @ApiCreatedResponse({ type: ContributionPreviewResponseDto })
  preview(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PreviewDto,
  ) {
    return this.service.preview(r.membership, id, d.wages);
  }
  @Post(':id/retire')
  @Roles('OWNER')
  @ApiOperation({
    summary:
      'Deactivate a ruleset while retaining its source and parameters for historical calculations',
  })
  retire(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retire(r.membership, id);
  }
}
