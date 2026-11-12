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
  TaxExpensesDto,
  TaxExpensesResponseDto,
  TaxExpensesHistoryDto,
} from './tax-expenses.dto';
import { TaxExpensesService } from './tax-expenses.service';
import { TaxOpeningQueryDto } from './tax-openings.dto';

@ApiBearerAuth()
@ApiTags('employee-tax-inputs')
@Roles('OWNER', 'HR', 'FINANCE')
@Controller('employees/:employeeId/tax-expenses')
export class TaxExpensesController {
  constructor(private service: TaxExpensesService) {}
  @Post()
  @Roles('OWNER', 'FINANCE')
  @ApiCreatedResponse({ type: TaxExpensesResponseDto })
  @ApiOperation({
    summary:
      'Append reviewed cumulative TP1 expense totals; each revision replaces earlier totals',
    description:
      'Include eligible prior-employer amounts once. Empty amounts records a reviewed zero declaration. Allowed deductions are recalculated with payroll spouse/EPF context; no caller-supplied allowed total is accepted.',
  })
  save(
    @Req() r: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) id: string,
    @Body() d: TaxExpensesDto,
  ) {
    return this.service.save(r.membership, id, d);
  }
  @Get()
  @ApiOkResponse({ type: TaxExpensesHistoryDto })
  history(
    @Req() r: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) id: string,
    @Query() q: TaxOpeningQueryDto,
  ) {
    return this.service.history(r.membership, id, q);
  }
}
