import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { Membership, Prisma, RequestStatus } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { PageDto, paginated } from '../common/page.dto';
import {
  audit,
  dateOnly,
  DecisionDto,
  decisionComment,
  fail,
  privileged,
  selfEmployee,
} from '../common/domain';
import { receiptScanAccepted, validateClaimPolicy } from './claim-policy';

export class ClaimTypeDto {
  @ApiProperty() @IsString() @Length(1, 30) code: string;
  @ApiProperty() @IsString() @Length(1, 150) name: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string | null;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  receiptRequired?: boolean;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Per-claim maximum, or null for no limit.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/)
  maxAmount?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string | null;
}

export class ClaimDto {
  @ApiProperty() @IsUUID() typeId: string;
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiProperty({ example: '25.50' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/)
  amount: string;

  @ApiProperty() @IsString() @Length(1, 2000) description: string;
  @ApiProperty({ enum: ['PAYROLL', 'BANK_TRANSFER'] })
  @IsIn(['PAYROLL', 'BANK_TRANSFER'])
  paymentMethod: string;
}

export class PayClaimDto {
  @ApiProperty()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  paymentDate: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  paymentReference: string;
}

export class ClaimQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() typeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

@Injectable()
export class ClaimsService {
  constructor(private db: Database) {}

  async type(m: Membership, id: string) {
    const data = await this.db.claimType.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!data) throw new NotFoundException();
    return { data };
  }

  async types(m: Membership, q: PageDto) {
    const where: Prisma.ClaimTypeWhereInput = {
      companyId: m.companyId,
      ...(q.search
        ? {
            OR: [
              { code: { contains: q.search, mode: 'insensitive' } },
              { name: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.claimType.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.claimType.count({ where }),
    ]);
    return paginated(data, total, q);
  }

  async createType(m: Membership, d: ClaimTypeDto) {
    const values = this.typeValues(d);
    return this.db.$transaction(async (tx) => {
      const data = await tx.claimType.create({
        data: { ...values, companyId: m.companyId },
      });
      await audit(tx, m, 'CLAIM_TYPE_CREATED', data.id);
      return { data };
    });
  }

  private typeValues(d: ClaimTypeDto) {
    if (!d.name.trim() || !d.code.trim())
      fail('INVALID_CLAIM_TYPE', 'Code and name cannot be blank.', 400);
    if (d.active === null || d.receiptRequired === null)
      fail('INVALID_CLAIM_TYPE', 'Boolean settings cannot be null.', 400);
    if (d.effectiveFrom && d.effectiveTo && d.effectiveTo < d.effectiveFrom)
      fail('INVALID_DATES', 'Type end date precedes start.', 400);
    if (d.maxAmount != null && new Prisma.Decimal(d.maxAmount).lte(0))
      fail('INVALID_AMOUNT', 'Maximum amount must be positive.', 400);
    return {
      ...d,
      active: d.active ?? true,
      receiptRequired: d.receiptRequired ?? false,
      description: d.description ?? null,
      maxAmount: d.maxAmount ?? null,
      effectiveFrom: d.effectiveFrom ? dateOnly(d.effectiveFrom) : null,
      effectiveTo: d.effectiveTo ? dateOnly(d.effectiveTo) : null,
    };
  }

  async updateType(m: Membership, id: string, d: ClaimTypeDto) {
    const values = this.typeValues(d);
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.claimType.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        const data = await tx.claimType.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: values,
        });
        await audit(tx, m, 'CLAIM_TYPE_UPDATED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async event(
    tx: Prisma.TransactionClient,
    m: Membership,
    id: string,
    action: string,
    status: RequestStatus,
    comment?: string,
  ) {
    await tx.claimEvent.create({
      data: {
        companyId: m.companyId,
        claimId: id,
        actorId: m.userId,
        action,
        status,
        comment,
      },
    });
    await audit(tx, m, action, id);
  }

  async detail(m: Membership, id: string) {
    const data = await this.db.claim.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
      include: {
        events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        files: {
          where: { archived: false },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            scanStatus: true,
            createdAt: true,
          },
        },
      },
    });
    if (
      !data ||
      !(
        m.employeeId === data.employeeId ||
        privileged(m, ['OWNER', 'HR', 'FINANCE']) ||
        (!!m.employeeId && m.employeeId === data.managerId)
      )
    )
      throw new NotFoundException();
    return { data: { ...data, amount: data.amount.toFixed(2) } };
  }

  async edit(m: Membership, id: string, d: ClaimDto) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.claim.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        const e = await selfEmployee(tx, m);
        if (row.employeeId !== e.id) throw new ForbiddenException();
        if (row.status !== 'DRAFT')
          fail('INVALID_STATE', 'Only draft claims can be edited.', 409);
        const type = await tx.claimType.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: d.typeId } },
        });
        if (!type) throw new NotFoundException('Claim type not found.');
        validateClaimPolicy(
          type,
          dateOnly(d.date),
          new Prisma.Decimal(d.amount),
        );
        if (dateOnly(d.date) < e.joinedDate)
          fail('CLAIM_BEFORE_EMPLOYMENT', 'Claim date precedes employment.');
        if (!d.description.trim())
          fail('DESCRIPTION_REQUIRED', 'Describe the expense.', 400);
        const data = await tx.claim.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { ...d, date: dateOnly(d.date), managerId: e.managerId },
        });
        await this.event(tx, m, id, 'CLAIM_DRAFT_UPDATED', 'DRAFT');
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async create(m: Membership, d: ClaimDto) {
    if (new Prisma.Decimal(d.amount).lte(0))
      fail('INVALID_AMOUNT', 'Claim amount must be greater than zero.');
    return this.db.$transaction(
      async (tx) => {
        const e = await selfEmployee(tx, m);
        const type = await tx.claimType.findFirst({
          where: { id: d.typeId, companyId: m.companyId, active: true },
        });
        if (!type) throw new NotFoundException('Claim type not found.');
        validateClaimPolicy(
          type,
          dateOnly(d.date),
          new Prisma.Decimal(d.amount),
        );
        if (!d.description.trim())
          fail('DESCRIPTION_REQUIRED', 'Describe the expense.', 400);
        if (dateOnly(d.date) < e.joinedDate)
          fail('CLAIM_BEFORE_EMPLOYMENT', 'Claim date precedes employment.');
        const data = await tx.claim.create({
          data: {
            ...d,
            date: dateOnly(d.date),
            employeeId: e.id,
            managerId: e.managerId,
            companyId: m.companyId,
          },
        });
        await this.event(tx, m, data.id, 'CLAIM_DRAFT_CREATED', 'DRAFT');
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async list(m: Membership, q: ClaimQueryDto, mode: 'own' | 'all' | 'pending') {
    if (
      mode === 'pending' &&
      !m.employeeId &&
      !privileged(m, ['OWNER', 'FINANCE'])
    )
      return paginated([], 0, q);
    if (q.from && q.to && q.to < q.from)
      fail('INVALID_RANGE', 'End date precedes start date.', 400);
    let where: Prisma.ClaimWhereInput = { companyId: m.companyId };
    if (mode === 'own') where.employeeId = (await selfEmployee(this.db, m)).id;
    if (mode === 'pending')
      where = {
        ...where,
        status: { in: ['PENDING_MANAGER', 'PENDING_FINANCE'] },
        ...(privileged(m, ['OWNER'])
          ? {}
          : {
              OR: [
                ...(privileged(m, ['FINANCE'])
                  ? [{ status: 'PENDING_FINANCE' as const }]
                  : []),
                ...(m.employeeId
                  ? [
                      {
                        status: 'PENDING_MANAGER' as const,
                        managerId: m.employeeId,
                      },
                    ]
                  : []),
              ],
            }),
      };
    where = {
      AND: [
        where,
        {
          status: q.status,
          typeId: q.typeId,
          employeeId: q.employeeId,
          ...(q.search
            ? { description: { contains: q.search, mode: 'insensitive' } }
            : {}),
          ...(q.from || q.to
            ? {
                date: {
                  ...(q.from ? { gte: dateOnly(q.from) } : {}),
                  ...(q.to ? { lte: dateOnly(q.to) } : {}),
                },
              }
            : {}),
        },
      ],
    };
    const [data, total] = await this.db.$transaction([
      this.db.claim.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.claim.count({ where }),
    ]);
    return paginated(
      data.map((r) => ({ ...r, amount: r.amount.toFixed(2) })),
      total,
      q,
    );
  }

  async submit(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.claim.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        const employee = await selfEmployee(tx, m);
        if (row.employeeId !== employee.id) throw new ForbiddenException();
        if (row.status !== 'DRAFT')
          fail('INVALID_STATE', 'Only draft claims can be submitted.', 409);
        const type = await tx.claimType.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: row.typeId } },
        });
        if (!type) throw new NotFoundException('Claim type not found.');
        validateClaimPolicy(type, row.date, row.amount);
        if (row.date < employee.joinedDate)
          fail('CLAIM_BEFORE_EMPLOYMENT', 'Claim date precedes employment.');
        const receipts = await tx.storedFile.findMany({
          where: {
            companyId: m.companyId,
            employeeId: row.employeeId,
            claimId: id,
            category: 'CLAIM_RECEIPT',
            archived: false,
          },
        });
        if (type.receiptRequired && !receipts.length)
          fail('CLAIM_RECEIPT_REQUIRED', 'Attach a receipt before submission.');
        if (receipts.some((file) => !receiptScanAccepted(file.scanStatus)))
          fail(
            'FILE_QUARANTINED',
            'All attached receipts must pass scanning before submission.',
            409,
          );
        if (
          !employee.managerId ||
          !(await tx.employee.findFirst({
            where: {
              companyId: m.companyId,
              id: employee.managerId,
              active: true,
            },
          }))
        )
          fail(
            'MANAGER_REQUIRED',
            'Assign a reporting manager before submitting a claim.',
          );
        const data = await tx.claim.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: {
            status: 'PENDING_MANAGER',
            managerId: employee.managerId,
            submittedAt: new Date(),
            policySnapshot: {
              typeId: type.id,
              code: type.code,
              name: type.name,
              receiptRequired: type.receiptRequired,
              maxAmount: type.maxAmount?.toFixed(2) ?? null,
              effectiveFrom:
                type.effectiveFrom?.toISOString().slice(0, 10) ?? null,
              effectiveTo: type.effectiveTo?.toISOString().slice(0, 10) ?? null,
              receiptIds: receipts.map((file) => file.id),
            },
          },
        });
        await this.event(tx, m, id, 'CLAIM_SUBMITTED', 'PENDING_MANAGER');
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async decide(m: Membership, id: string, d: DecisionDto) {
    decisionComment(d);
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.claim.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (!['PENDING_MANAGER', 'PENDING_FINANCE'].includes(row.status))
          fail('INVALID_STATE', 'Claim is not awaiting a decision.', 409);
        if (row.employeeId === m.employeeId)
          throw new ForbiddenException('You cannot approve your own claim.');
        const allowed =
          row.status === 'PENDING_MANAGER'
            ? m.employeeId === row.managerId || privileged(m, ['OWNER'])
            : privileged(m, ['OWNER', 'FINANCE']);
        if (!allowed) throw new ForbiddenException();
        const status: RequestStatus =
          d.decision === 'REJECT'
            ? 'REJECTED'
            : row.status === 'PENDING_MANAGER'
              ? 'PENDING_FINANCE'
              : 'APPROVED';
        const data = await tx.claim.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { status, decisionComment: d.comment, decidedBy: m.userId },
        });
        await this.event(tx, m, id, 'CLAIM_' + d.decision, status, d.comment);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async cancel(m: Membership, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.claim.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (row.employeeId !== (await selfEmployee(tx, m)).id)
          throw new ForbiddenException();
        if (
          !['DRAFT', 'PENDING_MANAGER', 'PENDING_FINANCE'].includes(row.status)
        )
          fail(
            'INVALID_STATE',
            'Only unapproved claims may be cancelled.',
            409,
          );
        const data = await tx.claim.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: { status: 'CANCELLED' },
        });
        await this.event(tx, m, id, 'CLAIM_CANCELLED', 'CANCELLED');
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async pay(m: Membership, id: string, d: PayClaimDto) {
    if (!d.paymentReference.trim())
      fail('PAYMENT_REFERENCE_REQUIRED', 'Provide a payment reference.', 400);
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.claim.findUnique({
          where: { companyId_id: { companyId: m.companyId, id } },
        });
        if (!row) throw new NotFoundException();
        if (row.status !== 'APPROVED' || row.paymentMethod !== 'BANK_TRANSFER')
          fail(
            'INVALID_STATE',
            'Only approved bank-transfer claims can be marked paid.',
            409,
          );
        if (dateOnly(d.paymentDate) < row.date)
          fail('INVALID_PAYMENT_DATE', 'Payment cannot precede claim date.');
        const data = await tx.claim.update({
          where: { companyId_id: { companyId: m.companyId, id } },
          data: {
            status: 'PAID',
            paymentDate: dateOnly(d.paymentDate),
            paymentReference: d.paymentReference,
          },
        });
        await this.event(tx, m, id, 'CLAIM_PAID', 'PAID');
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}

@ApiBearerAuth()
@ApiTags('claims')
@Controller('claims')
export class ClaimsController {
  constructor(private service: ClaimsService) {}
  @Get('types') types(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.types(r.membership, q);
  }
  @Get('types/:id') typeDetail(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.type(r.membership, id);
  }
  @Post('types') @Roles('OWNER', 'HR', 'FINANCE') type(
    @Req() r: TenantRequest,
    @Body() d: ClaimTypeDto,
  ) {
    return this.service.createType(r.membership, d);
  }
  @Post() create(@Req() r: TenantRequest, @Body() d: ClaimDto) {
    return this.service.create(r.membership, d);
  }
  @Put('types/:id')
  @Roles('OWNER', 'HR', 'FINANCE')
  @ApiOperation({
    summary:
      'Replace claim type settings; submitted claims retain their policy snapshot.',
  })
  updateType(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ClaimTypeDto,
  ) {
    return this.service.updateType(r.membership, id, d);
  }
  @Get('me') own(@Req() r: TenantRequest, @Query() q: ClaimQueryDto) {
    return this.service.list(r.membership, q, 'own');
  }
  @Get() @Roles('OWNER', 'HR', 'FINANCE') all(
    @Req() r: TenantRequest,
    @Query() q: ClaimQueryDto,
  ) {
    return this.service.list(r.membership, q, 'all');
  }
  @Get('pending') pending(@Req() r: TenantRequest, @Query() q: ClaimQueryDto) {
    return this.service.list(r.membership, q, 'pending');
  }
  @Post(':id/submit') submit(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.submit(r.membership, id);
  }
  @Get(':id')
  @ApiOperation({
    summary: 'Read a claim, receipts and complete decision history.',
  })
  detail(@Req() r: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(r.membership, id);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Replace an employee-owned draft claim.' })
  edit(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ClaimDto,
  ) {
    return this.service.edit(r.membership, id, d);
  }
  @Post(':id/decision') decide(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.service.decide(r.membership, id, d);
  }
  @Post(':id/cancel') cancel(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(r.membership, id);
  }
  @Post(':id/pay') @Roles('OWNER', 'FINANCE') pay(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PayClaimDto,
  ) {
    return this.service.pay(r.membership, id, d);
  }
}
@Module({ controllers: [ClaimsController], providers: [ClaimsService] })
export class ClaimsModule {}
