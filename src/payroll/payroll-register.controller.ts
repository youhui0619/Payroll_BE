import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import { Response } from 'express';
import { PayrollExecutionService } from './payroll-execution.service';
import {
  PayrollRegisterQueryDto,
  PayrollRegisterResponseDto,
} from './payroll-register.dto';

@ApiBearerAuth()
@ApiTags('payroll')
@Roles('OWNER', 'HR', 'FINANCE')
@Controller('payroll/runs')
export class PayrollRegisterController {
  constructor(private service: PayrollExecutionService) {}

  @Get(':id/register')
  @ApiOkResponse({ type: PayrollRegisterResponseDto })
  @ApiOperation({
    summary: 'List the calculated payroll register for a run',
    description:
      'Returns FE payroll overview amounts after calculation. Search matches employee number/name and departmentIds are UUID filters. Draft runs have no register rows; employees cannot read this administrative grid.',
  })
  list(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PayrollRegisterQueryDto,
  ) {
    return this.service.register(r.membership, id, q);
  }

  @Get(':id/register.csv')
  @ApiOperation({
    summary: 'Download the calculated payroll register CSV',
    description:
      'Exports the FE payroll overview columns for up to 5,000 filtered employees and records a tenant-scoped audit event.',
  })
  async export(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PayrollRegisterQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.service.registerCsv(r.membership, id, q);
    res.type('text/csv').attachment(result.filename).send(result.content);
  }
}
