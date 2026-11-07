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
import { IsString, IsUUID, Length, Matches } from 'class-validator';
import { Membership, Prisma } from '@prisma/client';
import { Roles, TenantRequest } from '../auth/auth.module';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';
import { payrollPeriod } from './payroll.service';

export class PayrollInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() employeeId: string;
  @ApiProperty({
    format: 'uuid',
    description: 'Reuse only for retrying the identical request.',
  })
  @IsUUID()
  idempotencyKey: string;
  @ApiProperty({ example: 'BONUS' })
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  componentCode: string;
  @ApiProperty({
    example: '100.00',
    description:
      'Positive amount; the component definition determines earning or deduction.',
  })
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  amount: string;
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class VoidPayrollInputDto {
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
class PayrollInputResponseData extends PayrollInputDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) companyId: string;
  @ApiProperty({ format: 'uuid' }) runId: string;
  @ApiProperty({ format: 'uuid' }) createdBy: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time', nullable: true }) voidedAt: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) voidedBy: string | null;
  @ApiProperty({ nullable: true }) voidReason: string | null;
}
class PayrollInputResponse {
  @ApiProperty({ type: PayrollInputResponseData })
  data: PayrollInputResponseData;
}
class PayrollInputsResponse {
  @ApiProperty({ type: [PayrollInputResponseData] })
  data: PayrollInputResponseData[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  meta: Record<string, number>;
}
@Injectable()
export class PayrollInputsService {
  constructor(private db: Database) {}
  private async run(
    tx: Prisma.TransactionClient,
    m: Membership,
    id: string,
    writable = false,
  ) {
    const run = await tx.payrollRun.findUnique({
      where: { companyId_id: { companyId: m.companyId, id } },
    });
    if (!run) throw new NotFoundException();
    if (writable && run.status !== 'DRAFT')
      fail(
        'PAYROLL_PERIOD_LOCKED',
        'Payroll inputs can only change in a draft run.',
        409,
      );
    return run;
  }
  async create(m: Membership, runId: string, d: PayrollInputDto) {
    if (['BASIC', 'UNPAID_LEAVE'].includes(d.componentCode))
      fail(
        'RESERVED_PAYROLL_COMPONENT',
        'Use an adjustment code; BASIC and UNPAID_LEAVE are generated automatically.',
        400,
      );
    const amount = new Prisma.Decimal(d.amount);
    const reason = d.reason.trim();
    if (
      !reason ||
      !amount.isFinite() ||
      amount.lte(0) ||
      amount.decimalPlaces() > 2 ||
      amount.gte('1000000000000')
    )
      fail(
        'INVALID_PAYROLL_INPUT',
        'Provide a positive amount with at most two decimals and a nonblank reason.',
        400,
      );
    return this.db.$transaction(
      async (tx) => {
        const run = await this.run(tx, m, runId);
        const existing = await tx.payrollInput.findUnique({
          where: {
            companyId_runId_idempotencyKey: {
              companyId: m.companyId,
              runId,
              idempotencyKey: d.idempotencyKey,
            },
          },
        });
        if (existing) {
          if (
            existing.employeeId !== d.employeeId ||
            existing.componentCode !== d.componentCode ||
            !existing.amount.equals(amount) ||
            existing.reason !== reason
          )
            fail(
              'IDEMPOTENCY_CONFLICT',
              'This request key was already used for different payroll input.',
              409,
            );
          return { data: existing };
        }
        if (run.status !== 'DRAFT')
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'Payroll inputs can only change in a draft run.',
            409,
          );
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: d.employeeId } },
        });
        if (!employee) throw new NotFoundException();
        const { start, next } = payrollPeriod(run.year, run.month);
        if (!employee.active || employee.joinedDate >= next)
          fail(
            'EMPLOYEE_NOT_ELIGIBLE',
            'Employee is not eligible for this payroll period.',
          );
        const definition = await tx.payrollComponentDefinition.findFirst({
          where: {
            companyId: m.companyId,
            code: d.componentCode,
            effectiveFrom: { lte: start },
          },
          orderBy: { revision: 'desc' },
        });
        if (!definition?.active)
          fail(
            'COMPONENT_UNAVAILABLE',
            'An active component definition must cover this payroll month.',
          );
        const count = await tx.payrollInput.count({
          where: {
            companyId: m.companyId,
            runId,
            employeeId: d.employeeId,
            voidedAt: null,
          },
        });
        if (count >= 500)
          fail(
            'PAYROLL_INPUT_LIMIT',
            'An employee may have at most 500 active manual inputs per run.',
          );
        const data = await tx.payrollInput.create({
          data: {
            ...d,
            amount,
            reason,
            companyId: m.companyId,
            runId,
            createdBy: m.userId,
          },
        });
        await audit(tx, m, 'PAYROLL_INPUT_CREATED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async void(m: Membership, runId: string, id: string, d: VoidPayrollInputDto) {
    if (!d.reason.trim())
      fail('INVALID_PAYROLL_INPUT', 'A nonblank void reason is required.', 400);
    return this.db.$transaction(
      async (tx) => {
        await this.run(tx, m, runId, true);
        const input = await tx.payrollInput.findFirst({
          where: { id, companyId: m.companyId, runId },
        });
        if (!input) throw new NotFoundException();
        if (input.voidedAt) {
          if (input.voidReason !== d.reason.trim())
            fail(
              'INPUT_ALREADY_VOIDED',
              'The input was already voided with a different reason.',
              409,
            );
          return { data: input };
        }
        const data = await tx.payrollInput.update({
          where: { id },
          data: {
            voidedAt: new Date(),
            voidedBy: m.userId,
            voidReason: d.reason.trim(),
          },
        });
        await audit(tx, m, 'PAYROLL_INPUT_VOIDED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async list(m: Membership, runId: string, q: PageDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.run(tx, m, runId);
        const where = { companyId: m.companyId, runId };
        const data = await tx.payrollInput.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        });
        return paginated(data, await tx.payrollInput.count({ where }), q);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
@ApiBearerAuth()
@ApiTags('payroll-inputs')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs/:runId/inputs')
export class PayrollInputsController {
  constructor(private service: PayrollInputsService) {}
  @Post()
  @ApiCreatedResponse({ type: PayrollInputResponse })
  @ApiOperation({
    summary:
      'Add a retained manual input to a draft; resolve component flags at calculation time',
  })
  create(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() d: PayrollInputDto,
  ) {
    return this.service.create(r.membership, runId, d);
  }
  @Get()
  @ApiOkResponse({ type: PayrollInputsResponse })
  @ApiOperation({ summary: 'List manual inputs including voided history' })
  list(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query() q: PageDto,
  ) {
    return this.service.list(r.membership, runId, q);
  }
  @Post(':id/void')
  @ApiCreatedResponse({ type: PayrollInputResponse })
  void(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: VoidPayrollInputDto,
  ) {
    return this.service.void(r.membership, runId, id, d);
  }
}
@Module({
  controllers: [PayrollInputsController],
  providers: [PayrollInputsService],
})
export class PayrollInputsModule {}
