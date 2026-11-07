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
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { audit, fail } from '../common/domain';
import { paginated } from '../common/page.dto';
import { TaxOpeningQueryDto } from './tax-openings.module';
import {
  calculateFamilyReliefs,
  ChildReliefKind,
  FamilyReliefInput,
} from './family-reliefs';
class ChildReliefDto {
  @ApiProperty({
    description:
      'Stable internal reference, not a national identification number.',
  })
  @IsString()
  @Length(1, 100)
  reference: string;
  @ApiProperty({
    enum: [
      'STANDARD',
      'HIGHER_EDUCATION',
      'DISABLED',
      'DISABLED_HIGHER_EDUCATION',
    ],
  })
  @IsIn([
    'STANDARD',
    'HIGHER_EDUCATION',
    'DISABLED',
    'DISABLED_HIGHER_EDUCATION',
  ])
  kind: ChildReliefKind;
  @ApiProperty({ enum: ['FULL', 'HALF'] }) @IsIn(['FULL', 'HALF']) share:
    'FULL' | 'HALF';
}
export class TaxFamilyDto implements FamilyReliefInput {
  @ApiProperty({ enum: [2026] }) @IsIn([2026]) year: number;
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  effectiveMonth: number;
  @ApiProperty({ enum: ['RESIDENT', 'NON_RESIDENT'] })
  @IsIn(['RESIDENT', 'NON_RESIDENT'])
  residency: 'RESIDENT' | 'NON_RESIDENT';
  @ApiProperty({ enum: [1, 2, 3] }) @IsIn([1, 2, 3]) category: 1 | 2 | 3;
  @ApiProperty() @IsBoolean() disabledIndividual: boolean;
  @ApiProperty() @IsBoolean() spouseReliefEligible: boolean;
  @ApiProperty() @IsBoolean() disabledSpouseReliefEligible: boolean;
  @ApiProperty({ type: [ChildReliefDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChildReliefDto)
  children: ChildReliefDto[];
  @ApiProperty() @IsString() @Length(1, 500) evidenceReference: string;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
class TaxFamilyVersionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) employeeId: string;
  @ApiProperty() year: number;
  @ApiProperty() effectiveMonth: number;
  @ApiProperty() revision: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  declaration: Record<string, unknown>;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Calculated family-only relief breakdown, source reference and limitations; excludes TP1 and EPF.',
  })
  reliefs: Record<string, unknown>;
  @ApiProperty() evidenceReference: string;
  @ApiProperty() reason: string;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
class TaxFamilyResponseDto {
  @ApiProperty({ type: TaxFamilyVersionDto }) data: TaxFamilyVersionDto;
}
class TaxFamilyHistoryDto {
  @ApiProperty({ type: [TaxFamilyVersionDto] }) data: TaxFamilyVersionDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  meta: Record<string, number>;
}
@Injectable()
export class TaxFamilyService {
  constructor(private db: Database) {}
  async save(m: Membership, employeeId: string, d: TaxFamilyDto) {
    if (!d.reason.trim() || !d.evidenceReference.trim())
      fail(
        'TAX_EVIDENCE_REQUIRED',
        'Provide reviewed evidence and a reason.',
        400,
      );
    const { effectiveMonth, evidenceReference, reason, ...declaration } = d;
    const reliefs = calculateFamilyReliefs(declaration);
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.employee.findUnique({
            where: { companyId_id: { companyId: m.companyId, id: employeeId } },
          }))
        )
          throw new NotFoundException();
        const latest = await tx.employeeTaxFamily.findFirst({
          where: { companyId: m.companyId, employeeId, year: d.year },
          orderBy: { revision: 'desc' },
        });
        if (latest && effectiveMonth < latest.effectiveMonth)
          fail(
            'TAX_FAMILY_HISTORY_ORDER',
            'A revision cannot precede the latest effective month.',
            409,
          );
        if (
          await tx.payrollRun.count({
            where: {
              companyId: m.companyId,
              year: d.year,
              month: { gte: effectiveMonth },
              status: { not: 'DRAFT' },
            },
          })
        )
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'This revision affects calculated or finalized payroll.',
            409,
          );
        const data = await tx.employeeTaxFamily.create({
          data: {
            companyId: m.companyId,
            employeeId,
            year: d.year,
            effectiveMonth,
            revision: (latest?.revision ?? 0) + 1,
            declaration: JSON.parse(
              JSON.stringify(declaration),
            ) as Prisma.InputJsonValue,
            reliefs: reliefs as unknown as Prisma.InputJsonValue,
            evidenceReference: evidenceReference.trim(),
            reason: reason.trim(),
            recordedBy: m.userId,
          },
        });
        await audit(tx, m, 'EMPLOYEE_TAX_FAMILY_RECORDED', data.id);
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
      this.db.employeeTaxFamily.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.employeeTaxFamily.count({ where }),
    ]);
    return paginated(data, total, q);
  }
}
@ApiBearerAuth()
@ApiTags('employee-tax-inputs')
@Roles('OWNER', 'HR', 'FINANCE')
@Controller('employees/:employeeId/tax-family')
export class TaxFamilyController {
  constructor(private service: TaxFamilyService) {}
  @Post()
  @Roles('OWNER', 'FINANCE')
  @ApiCreatedResponse({ type: TaxFamilyResponseDto })
  save(
    @Req() r: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) id: string,
    @Body() d: TaxFamilyDto,
  ) {
    return this.service.save(r.membership, id, d);
  }
  @Get()
  @ApiOkResponse({ type: TaxFamilyHistoryDto })
  history(
    @Req() r: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) id: string,
    @Query() q: TaxOpeningQueryDto,
  ) {
    return this.service.history(r.membership, id, q);
  }
}
@Module({ controllers: [TaxFamilyController], providers: [TaxFamilyService] })
export class TaxFamilyModule {}
