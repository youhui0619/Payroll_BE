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
  CalculatePayrollDto,
  PayrollExecutionResponseDto,
  PayrollLifecycleResponseDto,
  PayrollPaymentDto,
} from './payroll-execution.dto';
import { PayrollReopenDto } from './payroll-reopen.dto';
import { PayrollExecutionService } from './payroll-execution.service';

@ApiBearerAuth()
@ApiTags('payroll-execution')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs')
export class PayrollExecutionController {
  constructor(private service: PayrollExecutionService) {}

  @Post(':id/calculate')
  @ApiCreatedResponse({ type: PayrollExecutionResponseDto })
  @ApiOperation({
    summary: 'Calculate and persist every eligible employee in a draft run',
    description:
      'Runs the resolved PCB, statutory, salary, claim, commission and overtime calculation in one serializable transaction. The run becomes CALCULATED only when every employee succeeds.',
  })
  calculate(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CalculatePayrollDto,
  ) {
    return this.service.calculate(r.membership, id, d);
  }

  @Post(':id/reopen')
  @ApiCreatedResponse({ type: PayrollLifecycleResponseDto })
  @ApiOperation({
    summary: 'Reopen a calculated or approved payroll run',
    description:
      'Returns a pre-publication run to DRAFT, removes its derived employee snapshots and records the required audit reason. Published and paid runs are immutable.',
  })
  reopen(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PayrollReopenDto,
  ) {
    return this.service.reopen(r.membership, id, d);
  }

  @Post(':id/approve')
  @ApiCreatedResponse({ type: PayrollLifecycleResponseDto })
  @ApiOperation({ summary: 'Approve a calculated payroll run' })
  approve(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(r.membership, id);
  }

  @Post(':id/publish')
  @ApiCreatedResponse({ type: PayrollLifecycleResponseDto })
  @ApiOperation({ summary: 'Publish payslips for an approved payroll run' })
  publish(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.publish(r.membership, id);
  }

  @Post(':id/pay')
  @ApiCreatedResponse({ type: PayrollLifecycleResponseDto })
  @ApiOperation({
    summary: 'Record payment for a published payroll run',
    description:
      'Records a payment reference and settles PAYROLL claims, approved overtime and ready commissions assigned to the run.',
  })
  pay(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PayrollPaymentDto,
  ) {
    return this.service.pay(r.membership, id, d);
  }
}
