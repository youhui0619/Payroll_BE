import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
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
  ApiProperty,
  ApiTags,
  PickType,
} from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { audit, fail } from '../common/domain';
import { paginated } from '../common/page.dto';
import { TaxOpeningQueryDto } from './tax-openings.module';
import { Tp1PreviewDto } from './tp1.dto';
import { calculateTp1Reliefs } from './tp1-reliefs';
export class TaxExpensesDto extends PickType(Tp1PreviewDto, [
  'year',
  'amounts',
] as const) {
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  effectiveMonth: number;
  @ApiProperty({
    description:
      'Reviewed TP1/receipt reference, including eligibility and recurring-claim checks.',
  })
  @IsString()
  @Length(1, 500)
  evidenceReference: string;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
class TaxExpensesVersionDto extends TaxExpensesDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
class TaxExpensesResponseDto {
  @ApiProperty({ type: TaxExpensesVersionDto }) data: TaxExpensesVersionDto;
}
class TaxExpensesHistoryDto {
  @ApiProperty({ type: [TaxExpensesVersionDto] }) data: TaxExpensesVersionDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  meta: Record<string, number>;
}
@Injectable()
export class TaxExpensesService {
  constructor(private db: Database) {}
  async save(m: Membership, employeeId: string, d: TaxExpensesDto) {
    if (!d.reason.trim() || !d.evidenceReference.trim())
      fail(
        'TAX_EVIDENCE_REQUIRED',
        'Provide a review reference and reason.',
        400,
      );
    // Validate codes, amounts and mutually exclusive bands. Do not freeze an
    // allowed total here: spouse/EPF context belongs to the payroll calculation.
    const validated = calculateTp1Reliefs({
      ...d,
      spouseRelief: '0',
      projectedMandatoryEpf: '0',
    });
    const amounts = Object.fromEntries(
      validated.groups.flatMap((group) =>
        group.subitems.map((item) => [item.code, item.claimed]),
      ),
    );
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.employee.findUnique({
            where: { companyId_id: { companyId: m.companyId, id: employeeId } },
          }))
        )
          throw new NotFoundException();
        const latest = await tx.employeeTaxExpenses.findFirst({
          where: { companyId: m.companyId, employeeId, year: d.year },
          orderBy: { revision: 'desc' },
        });
        if (latest && d.effectiveMonth < latest.effectiveMonth)
          fail(
            'TAX_EXPENSE_HISTORY_ORDER',
            'A replacement cannot precede the latest effective month.',
            409,
          );
        if (
          await tx.payrollRun.count({
            where: {
              companyId: m.companyId,
              year: d.year,
              month: { gte: d.effectiveMonth },
              status: { not: 'DRAFT' },
            },
          })
        )
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'This declaration affects calculated or finalized payroll.',
            409,
          );
        const data = await tx.employeeTaxExpenses.create({
          data: {
            companyId: m.companyId,
            employeeId,
            year: d.year,
            effectiveMonth: d.effectiveMonth,
            revision: (latest?.revision ?? 0) + 1,
            amounts,
            evidenceReference: d.evidenceReference.trim(),
            reason: d.reason.trim(),
            recordedBy: m.userId,
          },
        });
        await audit(tx, m, 'EMPLOYEE_TAX_EXPENSES_RECORDED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async history(m: Membership, employeeId: string, q: TaxOpeningQueryDto) {
    if (
      !(await this.db.employee.findUnique({
        where: { companyId_id: { companyId: m.companyId, id: employeeId } },
      }))
    )
      throw new NotFoundException();
    const where = { companyId: m.companyId, employeeId, year: q.year };
    const [data, total] = await this.db.$transaction([
      this.db.employeeTaxExpenses.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.employeeTaxExpenses.count({ where }),
    ]);
    return paginated(data, total, q);
  }
}
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
@Module({
  controllers: [TaxExpensesController],
  providers: [TaxExpensesService],
})
export class TaxExpensesModule {}
