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
import {
  PayrollRosterQueryDto,
  PayrollRosterResponseDto,
} from './payroll-roster.dto';
import { PayrollRosterService } from './payroll-roster.service';

@ApiBearerAuth()
@ApiTags('payroll')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs/:id/employees')
export class PayrollRosterController {
  constructor(private service: PayrollRosterService) {}

  @Get()
  @ApiOkResponse({ type: PayrollRosterResponseDto })
  @ApiOperation({
    summary: 'List draft-run employees for payroll preparation',
    description:
      'Active employees joined before the next month. Search employee number/name and filter by department UUIDs. Department/position are current assignments, not historical snapshots. Missing salary or tax setup does not hide employees; use preflight and input-preview for those checks. No calculated amounts or payslip status are returned.',
  })
  list(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PayrollRosterQueryDto,
  ) {
    return this.service.list(r.membership, id, q);
  }
}
