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
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from 'class-validator';
import { Membership, Prisma, StatutoryScheme } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { audit, dateOnly, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import { calculateContribution, validateRules } from './calculator';
import { statutoryCatalog } from './data/catalog';
import { PcbController } from './pcb.controller';
export class CatalogItemDto {
  @ApiProperty() key: string;
  @ApiProperty({ enum: StatutoryScheme }) scheme: StatutoryScheme;
  @ApiProperty() category: string;
  @ApiProperty() version: string;
  @ApiProperty({ format: 'date' }) effectiveFrom: string;
  @ApiPropertyOptional({ format: 'date' }) effectiveTo?: string;
  @ApiProperty() sourceUrl: string;
  @ApiProperty() sourceSha256: string;
  @ApiProperty({ enum: ['ORIGINAL_PDF', 'EXTRACTED_DATA'] })
  checksumKind: string;
  @ApiProperty() sourceArtifact: string;
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  supportingSources?: Record<string, string>[];
  @ApiProperty({ type: [String] }) limitations: string[];
  @ApiProperty({ enum: ['TABLE', 'RATE', 'EXEMPT'] }) calculator: string;
  @ApiProperty() bandCount: number;
}
export class CatalogResponseDto {
  @ApiProperty({ type: [CatalogItemDto] }) data: CatalogItemDto[];
}
export class RulesDto {
  @ApiProperty({ enum: StatutoryScheme })
  @IsEnum(StatutoryScheme)
  scheme: StatutoryScheme;
  @ApiProperty() @IsString() @Length(1, 80) category: string;
  @ApiProperty() @IsString() @Length(1, 80) version: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string;
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  sourceUrl: string;
  @ApiProperty() @Matches(/^[a-f0-9]{64}$/) sourceSha256: string;
  @ApiProperty({
    type: 'object',
    description:
      'TABLE (bands), RATE (rates and rounding), or EXEMPT (reason). Draft references must be verified before activation.',
  })
  @IsObject()
  parameters: Record<string, unknown>;
}
export class PreviewDto {
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) wages: string;
}
class ContributionPreviewDataDto {
  @ApiProperty() employee: string;
  @ApiProperty() employer: string;
  @ApiProperty() basis: string;
  @ApiPropertyOptional({
    description: 'Combined remittance total for TOTAL_WHOLE_UP rules.',
  })
  total?: string;
  @ApiPropertyOptional({
    description:
      'Signed difference between the remittance total and displayed shares; not automatically charged to either party.',
  })
  remittanceRounding?: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) trace: Record<
    string,
    unknown
  >;
  @ApiProperty({ format: 'uuid' }) rulesetId: string;
  @ApiProperty() version: string;
  @ApiProperty({ enum: StatutoryScheme }) scheme: StatutoryScheme;
  @ApiProperty() sourceUrl: string;
  @ApiProperty() sourceSha256: string;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  provenance: Record<string, unknown> | null;
}
class ContributionPreviewResponseDto {
  @ApiProperty({ type: ContributionPreviewDataDto })
  data: ContributionPreviewDataDto;
}
@Injectable()
export class RulesService {
  constructor(private db: Database) {}
  catalog() {
    return {
      data: statutoryCatalog.map(({ parameters, ...entry }) => ({
        ...entry,
        calculator: parameters.kind,
        bandCount: parameters.bands?.length ?? 0,
      })),
    };
  }
  async importCatalog(m: Membership, key: string) {
    const entry = statutoryCatalog.find((item) => item.key === key);
    if (!entry) throw new NotFoundException();
    return this.create(m, {
      scheme: entry.scheme,
      category: entry.category,
      version: entry.version,
      effectiveFrom: entry.effectiveFrom,
      effectiveTo: entry.effectiveTo,
      sourceUrl: entry.sourceUrl,
      sourceSha256: entry.sourceSha256,
      parameters: {
        ...entry.parameters,
        provenance: {
          catalogKey: entry.key,
          checksumKind: entry.checksumKind,
          sourceArtifact: entry.sourceArtifact,
          supportingSources: entry.supportingSources ?? [],
          limitations: entry.limitations,
        },
      },
    });
  }
  async list(m: Membership, q: PageDto) {
    const where = { companyId: m.companyId };
    const [data, total] = await this.db.$transaction([
      this.db.statutoryRuleset.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.statutoryRuleset.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async create(m: Membership, d: RulesDto) {
    validateRules(d.parameters);
    if (d.scheme === 'PCB')
      fail(
        'PCB_CALCULATOR_PENDING',
        'PCB needs its dedicated computerized calculation and conformance suite; contribution tables cannot substitute for PCB.',
        422,
      );
    if (d.effectiveTo && d.effectiveTo < d.effectiveFrom)
      fail('INVALID_DATES', 'End date precedes start date.', 400);
    const host = new URL(d.sourceUrl).hostname;
    const domains = [
      'kwsp.gov.my',
      'perkeso.gov.my',
      'hasil.gov.my',
      'hrdcorp.gov.my',
    ];
    if (
      !domains.some((domain) => host === domain || host.endsWith('.' + domain))
    )
      fail(
        'INVALID_SOURCE',
        'Use an official statutory authority source URL.',
        400,
      );
    return this.db.$transaction(async (tx) => {
      const data = await tx.statutoryRuleset.create({
        data: {
          ...d,
          companyId: m.companyId,
          parameters: d.parameters as Prisma.InputJsonValue,
          effectiveFrom: dateOnly(d.effectiveFrom),
          effectiveTo: d.effectiveTo ? dateOnly(d.effectiveTo) : null,
        },
      });
      await audit(tx, m, 'RULESET_IMPORTED', data.id);
      return { data };
    });
  }
  async activate(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.statutoryRuleset.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        const overlaps = await tx.statutoryRuleset.count({
          where: {
            companyId: m.companyId,
            scheme: row.scheme,
            category: row.category,
            active: true,
            id: { not: id },
            ...(row.effectiveTo
              ? { effectiveFrom: { lte: row.effectiveTo } }
              : {}),
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: row.effectiveFrom } },
            ],
          },
        });
        if (overlaps)
          fail(
            'RULESET_OVERLAP',
            'Active rulesets may not overlap for the same scheme/category.',
            409,
          );
        const data = await tx.statutoryRuleset.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { active: true },
        });
        await audit(tx, m, 'RULESET_ACTIVATED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async preview(m: Membership, id: string, wages: string) {
    const row = await this.db.statutoryRuleset.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!row) throw new NotFoundException();
    return {
      data: {
        ...calculateContribution(wages, row.parameters),
        rulesetId: row.id,
        version: row.version,
        scheme: row.scheme,
        sourceUrl: row.sourceUrl,
        sourceSha256: row.sourceSha256,
        provenance: (row.parameters as Prisma.JsonObject).provenance ?? null,
      },
    };
  }
  async retire(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.statutoryRuleset.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        const data = row.active
          ? await tx.statutoryRuleset.update({
              where: { companyId_id: { companyId: m.companyId, id } },
              data: { active: false },
            })
          : row;
        if (row.active) await audit(tx, m, 'RULESET_RETIRED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
@ApiBearerAuth()
@ApiTags('statutory-rules')
@Roles('OWNER', 'FINANCE')
@Controller('statutory/rulesets')
export class RulesController {
  constructor(private service: RulesService) {}
  @Get('catalog')
  @ApiOkResponse({ type: CatalogResponseDto })
  @ApiOperation({
    summary: 'List bundled source-backed rules and their limitations',
  })
  catalog() {
    return this.service.catalog();
  }
  @Post('catalog/:key/import')
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Import an inactive company draft; duplicate versions return 409',
  })
  importCatalog(@Req() r: TenantRequest, @Param('key') key: string) {
    return this.service.importCatalog(r.membership, key);
  }
  @Get() list(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.list(r.membership, q);
  }
  @Post() create(@Req() r: TenantRequest, @Body() d: RulesDto) {
    return this.service.create(r.membership, d);
  }
  @Post(':id/activate') @Roles('OWNER') activate(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.activate(r.membership, id);
  }
  @Post(':id/preview')
  @ApiCreatedResponse({ type: ContributionPreviewResponseDto })
  preview(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PreviewDto,
  ) {
    return this.service.preview(r.membership, id, d.wages);
  }
  @Post(':id/retire')
  @Roles('OWNER')
  @ApiOperation({
    summary:
      'Deactivate a ruleset while retaining its source and parameters for historical calculations',
  })
  retire(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retire(r.membership, id);
  }
}
@Module({
  controllers: [RulesController, PcbController],
  providers: [RulesService],
})
export class RulesModule {}
