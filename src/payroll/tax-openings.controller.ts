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
import {
  TaxOpeningDto,
  TaxOpeningQueryDto,
  TaxOpeningResponseDto,
  TaxOpeningHistoryDto,
} from './tax-openings.dto';
import { TaxOpeningsService } from './tax-openings.service';

@ApiBearerAuth()
@ApiTags('employee-tax-inputs')
@Roles('OWNER', 'HR', 'FINANCE')
@Controller('employees/:employeeId/tax-openings')
export class TaxOpeningsController {
  constructor(private service: TaxOpeningsService) {}
  @Post()
  @Roles('OWNER', 'FINANCE')
  @ApiCreatedResponse({ type: TaxOpeningResponseDto })
  @ApiOperation({
    summary:
      'Append reviewed previous-employer YTD totals; corrections replace totals, not add to them',
  })
  save(
    @Req() r: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) id: string,
    @Body() d: TaxOpeningDto,
  ) {
    return this.service.save(r.membership, id, d);
  }
  @Get()
  @ApiOkResponse({ type: TaxOpeningHistoryDto })
  history(
    @Req() r: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) id: string,
    @Query() q: TaxOpeningQueryDto,
  ) {
    return this.service.history(r.membership, id, q);
  }
}
