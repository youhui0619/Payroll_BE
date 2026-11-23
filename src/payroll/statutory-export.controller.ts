import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles, TenantRequest } from '../auth/auth.decorators';
import {
  STATUTORY_EXPORT_SCHEMES,
  StatutoryExportScheme,
  StatutoryExportService,
} from './statutory-export.service';

@ApiBearerAuth()
@ApiTags('statutory-exports')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs')
export class StatutoryExportController {
  constructor(private service: StatutoryExportService) {}

  @Get(':id/statutory-exports/:scheme')
  @ApiOperation({
    summary: 'Download a finalized payroll statutory review CSV',
    description:
      'Exports one paid or published run for EPF, SOCSO, EIS, LINDUNG_24_JAM, PCB or HRD. This versioned review export is not an official e-filing file; exact submission layouts remain jurisdiction/provider specific.',
  })
  async download(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scheme', new ParseEnumPipe(STATUTORY_EXPORT_SCHEMES))
    scheme: StatutoryExportScheme,
    @Res() res: Response,
  ) {
    const result = await this.service.export(r.membership, id, scheme);
    res.type('text/csv').attachment(result.filename).send(result.content);
  }
}
