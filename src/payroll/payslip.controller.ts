import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { PageDto } from '../common/page.dto';
import { PayrollExecutionService } from './payroll-execution.service';

@ApiBearerAuth()
@ApiTags('payslips')
@Roles('OWNER', 'HR', 'FINANCE', 'EMPLOYEE')
@Controller('payroll/runs')
export class PayslipController {
  constructor(private service: PayrollExecutionService) {}

  @Get(':id/payslips')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        meta: { type: 'object', additionalProperties: true },
      },
    },
  })
  @ApiOperation({
    summary: 'List published payslips for a payroll run',
    description:
      'Employees may only read their own published payslip; payroll staff may read the run.',
  })
  list(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.payslips(r.membership, id, q);
  }

  @Get(':id/payslips/:employeeId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiOperation({ summary: 'Read one published employee payslip' })
  detail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.service.payslip(r.membership, id, employeeId);
  }
}
