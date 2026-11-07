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
} from '@nestjs/swagger';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { audit, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';

export class TaxOpeningDto {
  @ApiProperty({ minimum: 2000, maximum: 2200 })
  @IsInt()
  @Min(2000)
  @Max(2200)
  year: number;
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  effectiveMonth: number;
  @ApiProperty({
    description:
      'Cumulative current-year taxable remuneration from previous employers only; replacement total, not delta.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  taxableIncome: string;
  @ApiProperty({
    description: 'Previous-employer employee EPF before annual cap.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  employeeEpf: string;
  @ApiProperty({
    description:
      'Previous-employer MTD excluding CP38 and voluntary extra withholding.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  mtd: string;
  @ApiProperty() @Matches(/^\d{1,12}(\.\d{1,2})?$/) zakat: string;
  @ApiProperty({ description: 'Reference to reviewed TP3/supporting records.' })
  @IsString()
  @Length(1, 500)
  evidenceReference: string;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class TaxOpeningQueryDto extends PageDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year: number;
}
class TaxOpeningVersionDto extends TaxOpeningDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
class TaxOpeningResponseDto {
  @ApiProperty({ type: TaxOpeningVersionDto }) data: TaxOpeningVersionDto;
}
class TaxOpeningHistoryDto {
  @ApiProperty({ type: [TaxOpeningVersionDto] }) data: TaxOpeningVersionDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  meta: Record<string, number>;
}
@Injectable()
export class TaxOpeningsService {
  constructor(private db: Database) {}
  async save(m: Membership, employeeId: string, d: TaxOpeningDto) {
    if (!d.reason.trim() || !d.evidenceReference.trim())
      fail(
        'TAX_EVIDENCE_REQUIRED',
        'Provide a review reference and reason.',
        400,
      );
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.employee.findUnique({
            where: { companyId_id: { companyId: m.companyId, id: employeeId } },
          }))
        )
          throw new NotFoundException();
        const latest = await tx.employeeTaxOpening.findFirst({
          where: { companyId: m.companyId, employeeId, year: d.year },
          orderBy: { revision: 'desc' },
        });
        if (latest && d.effectiveMonth < latest.effectiveMonth)
          fail(
            'TAX_OPENING_HISTORY_ORDER',
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
            'This revision affects calculated or finalized payroll.',
            409,
          );
        const data = await tx.employeeTaxOpening.create({
          data: {
            ...d,
            reason: d.reason.trim(),
            evidenceReference: d.evidenceReference.trim(),
            companyId: m.companyId,
            employeeId,
            revision: (latest?.revision ?? 0) + 1,
            recordedBy: m.userId,
          },
        });
        await audit(tx, m, 'EMPLOYEE_TAX_OPENING_RECORDED', data.id);
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
      this.db.employeeTaxOpening.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.employeeTaxOpening.count({ where }),
    ]);
    return paginated(data, total, q);
  }
}
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
@Module({
  controllers: [TaxOpeningsController],
  providers: [TaxOpeningsService],
})
export class TaxOpeningsModule {}
