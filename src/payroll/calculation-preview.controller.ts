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
  CalculationPreviewDto,
  CalculationPreviewResponseDto,
} from './calculation-preview.dto';
import { CalculationPreviewService } from './calculation-preview.service';

@ApiBearerAuth()
@ApiTags('payroll')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs/:id/employees/:employeeId/calculation-preview')
export class CalculationPreviewController {
  constructor(private service: CalculationPreviewService) {}
  @Post()
  @ApiCreatedResponse({ type: CalculationPreviewResponseDto })
  @ApiOperation({
    summary: 'Preview resolved 2026 standard PCB and payroll totals',
    description:
      'Requires complete contribution rules/EPF allocation, settled prior-month YTD and explicit tax opening/family/TP1 declarations. Payroll profile pcbCategory must be RESIDENT or NON_RESIDENT and match the declaration. No payroll is persisted or approved.',
  })
  preview(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() d: CalculationPreviewDto,
  ) {
    return this.service.preview(r.membership, id, employeeId, d);
  }
}
