import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
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
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Membership, StatutoryScheme } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { audit, dateOnly, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';

export class ComponentDefinitionDto {
  @ApiProperty({ example: 'BASIC' })
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  code: string;
  @ApiProperty() @IsString() @Length(1, 100) name: string;
  @ApiProperty({ enum: ['EARNING', 'DEDUCTION'] })
  @IsIn(['EARNING', 'DEDUCTION'])
  kind: 'EARNING' | 'DEDUCTION';
  @ApiProperty({
    format: 'date',
    description: 'First day of the effective salary month.',
  })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-01$/)
  effectiveFrom: string;
  @ApiProperty() @IsBoolean() active: boolean;
  @ApiProperty() @IsBoolean() affectsGross: boolean;
  @ApiProperty() @IsBoolean() affectsNet: boolean;
  @ApiProperty({
    enum: StatutoryScheme,
    isArray: true,
    description:
      'Earnings add and deductions subtract from these wage bases. Eligibility/exemptions must be reviewed separately.',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsEnum(StatutoryScheme, { each: true })
  statutoryBases: StatutoryScheme[];
  @ApiProperty({
    enum: [
      'NORMAL',
      'ADDITIONAL',
      'EXCLUDED',
      'EXCLUDED_NORMAL',
      'EXCLUDED_ADDITIONAL',
      'UNCLASSIFIED',
    ],
    default: 'UNCLASSIFIED',
    required: false,
    description:
      'PCB-bearing components require NORMAL or ADDITIONAL. Tax-exempt EPF-bearing payments use EXCLUDED_NORMAL or EXCLUDED_ADDITIONAL; other excluded payments may use EXCLUDED or UNCLASSIFIED; exclusion eligibility must be reviewed separately.',
  })
  @IsIn([
    'NORMAL',
    'ADDITIONAL',
    'EXCLUDED',
    'EXCLUDED_NORMAL',
    'EXCLUDED_ADDITIONAL',
    'UNCLASSIFIED',
  ])
  pcbTreatment?: string = 'UNCLASSIFIED';
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class ComponentListDto extends PageDto {
  @ApiProperty({
    format: 'date',
    description:
      'Salary month to resolve, using its first day. Search filters code only.',
  })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-01$/)
  asOf: string;
}
class ComponentVersionDto extends ComponentDefinitionDto {
  @ApiProperty({
    format: 'date-time',
    description: 'UTC midnight of the effective salary month.',
  })
  effectiveFrom: string;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'uuid' }) recordedBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
class ComponentResponseDto {
  @ApiProperty({ type: ComponentVersionDto }) data: ComponentVersionDto;
}
class ComponentListResponseDto {
  @ApiProperty({ type: [ComponentVersionDto] }) data: ComponentVersionDto[];
  @ApiProperty({
    type: 'object',
    properties: {
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      total: { type: 'integer' },
      totalPages: { type: 'integer' },
    },
  })
  meta: Record<string, number>;
}

@Injectable()
export class ComponentDefinitionsService {
  constructor(private db: Database) {}
  async save(m: Membership, d: ComponentDefinitionDto) {
    const pcbTreatment = d.pcbTreatment ?? 'UNCLASSIFIED';
    if (
      d.statutoryBases.includes('PCB')
        ? !['NORMAL', 'ADDITIONAL'].includes(pcbTreatment)
        : ![
            'EXCLUDED',
            'EXCLUDED_NORMAL',
            'EXCLUDED_ADDITIONAL',
            'UNCLASSIFIED',
          ].includes(pcbTreatment)
    )
      fail(
        'INVALID_PCB_TREATMENT',
        'PCB wage-base flags and remuneration classification must agree.',
        400,
      );
    if (!d.name.trim() || !d.reason.trim())
      fail(
        'INVALID_COMPONENT_DEFINITION',
        'Name and reason cannot be blank.',
        400,
      );
    if (!d.affectsGross && !d.affectsNet && !d.statutoryBases.length)
      fail(
        'INVALID_COMPONENT_DEFINITION',
        'A component must affect pay or a statutory basis.',
        400,
      );
    return this.db.$transaction(
      async (tx) => {
        const effectiveFrom = dateOnly(d.effectiveFrom);
        const latest = await tx.payrollComponentDefinition.findFirst({
          where: { companyId: m.companyId, code: d.code },
          orderBy: { revision: 'desc' },
        });
        if (latest && effectiveFrom < latest.effectiveFrom)
          fail(
            'COMPONENT_HISTORY_ORDER',
            'Changes cannot precede the latest effective month for this code.',
            409,
          );
        if (!latest) {
          const codes = await tx.payrollComponentDefinition.groupBy({
            by: ['code'],
            where: { companyId: m.companyId },
            orderBy: { code: 'asc' },
            take: 1000,
          });
          if (codes.length >= 1000)
            fail(
              'COMPONENT_LIMIT',
              'A company may have at most 1000 component codes.',
            );
        }
        const locked = await tx.payrollRun.count({
          where: {
            companyId: m.companyId,
            status: { not: 'DRAFT' },
            OR: [
              { year: { gt: effectiveFrom.getUTCFullYear() } },
              {
                year: effectiveFrom.getUTCFullYear(),
                month: { gte: effectiveFrom.getUTCMonth() + 1 },
              },
            ],
          },
        });
        if (locked)
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'A calculated or finalized payroll exists in the affected period.',
            409,
          );
        const data = await tx.payrollComponentDefinition.create({
          data: {
            ...d,
            pcbTreatment,
            name: d.name.trim(),
            reason: d.reason.trim(),
            effectiveFrom,
            companyId: m.companyId,
            revision: (latest?.revision ?? 0) + 1,
            recordedBy: m.userId,
          },
        });
        await audit(tx, m, 'PAYROLL_COMPONENT_REVISED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async list(m: Membership, q: ComponentListDto) {
    return this.db.$transaction(
      async (tx) => {
        const groups = await tx.payrollComponentDefinition.groupBy({
          by: ['code'],
          where: {
            companyId: m.companyId,
            effectiveFrom: { lte: dateOnly(q.asOf) },
            ...(q.search ? { code: { contains: q.search.toUpperCase() } } : {}),
          },
          _max: { revision: true },
          orderBy: { code: 'asc' },
          take: 1001,
        });
        if (groups.length > 1000)
          fail('COMPONENT_LIMIT', 'Component code limit exceeded.');
        const page = groups.slice(
          (q.page - 1) * q.pageSize,
          q.page * q.pageSize,
        );
        if (!page.length) return paginated([], groups.length, q);
        const data = await tx.payrollComponentDefinition.findMany({
          where: {
            companyId: m.companyId,
            OR: page.map((g) => ({ code: g.code, revision: g._max.revision })),
          },
          orderBy: { code: 'asc' },
        });
        return paginated(data, groups.length, q);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async history(m: Membership, code: string, q: PageDto) {
    const where = { companyId: m.companyId, code };
    const [data, total] = await this.db.$transaction([
      this.db.payrollComponentDefinition.findMany({
        where,
        orderBy: { revision: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.payrollComponentDefinition.count({ where }),
    ]);
    if (!total) throw new NotFoundException();
    return paginated(data, total, q);
  }
}
@ApiBearerAuth()
@ApiTags('payroll-components')
@Roles('OWNER', 'HR', 'FINANCE')
@Controller('payroll/component-definitions')
export class ComponentDefinitionsController {
  constructor(private service: ComponentDefinitionsService) {}
  @Post()
  @Roles('OWNER')
  @ApiCreatedResponse({ type: ComponentResponseDto })
  @ApiOperation({
    summary:
      'Append a versioned earning/deduction definition; inactive revisions archive the code',
  })
  save(@Req() r: TenantRequest, @Body() d: ComponentDefinitionDto) {
    return this.service.save(r.membership, d);
  }
  @Get()
  @ApiOkResponse({ type: ComponentListResponseDto })
  list(@Req() r: TenantRequest, @Query() q: ComponentListDto) {
    return this.service.list(r.membership, q);
  }
  @Get(':code/history')
  @ApiOkResponse({ type: ComponentListResponseDto })
  history(
    @Req() r: TenantRequest,
    @Param('code') code: string,
    @Query() q: PageDto,
  ) {
    return this.service.history(r.membership, code, q);
  }
}
@Module({
  controllers: [ComponentDefinitionsController],
  providers: [ComponentDefinitionsService],
  exports: [ComponentDefinitionsService],
})
export class ComponentDefinitionsModule {}
