import {
  Body,
  Controller,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { Membership } from '@prisma/client';
import { Roles, TenantRequest } from '../auth/auth.module';
import { Database } from '../database.module';
import { audit, fail } from '../common/domain';

export class ClaimAllocationReasonDto {
  @ApiProperty() @IsString() @Length(1, 1000) reason: string;
}
export class ClaimAllocationDto extends ClaimAllocationReasonDto {
  @ApiProperty({ example: 'REIMBURSEMENT' })
  @Matches(/^[A-Z][A-Z0-9_]{0,49}$/)
  componentCode: string;
}
class ClaimAllocationDataDto {
  @ApiProperty({ format: 'uuid' }) claimId: string;
  @ApiProperty({ format: 'uuid', nullable: true }) runId: string | null;
  @ApiProperty({ nullable: true }) componentCode: string | null;
}
class ClaimAllocationResponseDto {
  @ApiProperty({ type: ClaimAllocationDataDto }) data: ClaimAllocationDataDto;
}
@Injectable()
export class ClaimAllocationService {
  constructor(private db: Database) {}
  async change(
    m: Membership,
    runId: string,
    claimId: string,
    d: ClaimAllocationReasonDto,
    componentCode?: string,
  ) {
    if (!d.reason.trim())
      fail('REASON_REQUIRED', 'Provide an allocation reason.', 400);
    if (componentCode && ['BASIC', 'UNPAID_LEAVE'].includes(componentCode))
      fail('RESERVED_PAYROLL_COMPONENT', 'Use a claim earning component.', 400);
    return this.db.$transaction(
      async (tx) => {
        const run = await tx.payrollRun.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: runId } },
        });
        if (!run) throw new NotFoundException();
        if (run.status !== 'DRAFT')
          fail(
            'PAYROLL_PERIOD_LOCKED',
            'Claim allocations can only change in draft runs.',
            409,
          );
        const claim = await tx.claim.findUnique({
          where: { companyId_id: { companyId: m.companyId, id: claimId } },
          include: { employee: true },
        });
        if (!claim) throw new NotFoundException();
        if (claim.status !== 'APPROVED' || claim.paymentMethod !== 'PAYROLL')
          fail(
            'CLAIM_NOT_PAYROLL_READY',
            'Only approved unpaid PAYROLL claims may be allocated.',
            409,
          );
        if (claim.payrollRunId && claim.payrollRunId !== runId)
          fail(
            'CLAIM_ALREADY_ALLOCATED',
            'This claim belongs to another payroll run.',
            409,
          );
        const start = new Date(Date.UTC(run.year, run.month - 1, 1)),
          next = new Date(Date.UTC(run.year, run.month, 1));
        if (componentCode) {
          if (
            !claim.employee.active ||
            claim.employee.joinedDate >= next ||
            claim.date >= next
          )
            fail(
              'CLAIM_PERIOD_INELIGIBLE',
              'Employee and claim must be eligible by the end of this payroll period.',
            );
          const definition = await tx.payrollComponentDefinition.findFirst({
            where: {
              companyId: m.companyId,
              code: componentCode,
              effectiveFrom: { lte: start },
            },
            orderBy: { revision: 'desc' },
          });
          if (
            !definition?.active ||
            definition.kind !== 'EARNING' ||
            !definition.affectsNet
          )
            fail(
              'INVALID_CLAIM_COMPONENT',
              'Use an active earning component affecting net pay. Review gross/statutory flags for this claim.',
            );
          if (
            claim.payrollRunId === runId &&
            claim.payrollComponentCode === componentCode
          )
            return { data: { claimId, runId, componentCode } };
          const count = await tx.claim.count({
            where: {
              companyId: m.companyId,
              employeeId: claim.employeeId,
              payrollRunId: runId,
              id: { not: claimId },
            },
          });
          if (count >= 400)
            fail(
              'PAYROLL_INPUT_LIMIT',
              'An employee may have at most 400 claims in a payroll run.',
            );
        } else if (!claim.payrollRunId)
          return { data: { claimId, runId: null, componentCode: null } };
        await tx.claim.update({
          where: { companyId_id: { companyId: m.companyId, id: claimId } },
          data: {
            payrollRunId: componentCode ? runId : null,
            payrollComponentCode: componentCode ?? null,
          },
        });
        const action = componentCode
          ? 'CLAIM_PAYROLL_ALLOCATED'
          : 'CLAIM_PAYROLL_RELEASED';
        await tx.claimEvent.create({
          data: {
            companyId: m.companyId,
            claimId,
            actorId: m.userId,
            action,
            status: claim.status,
            comment: JSON.stringify({
              runId,
              componentCode: componentCode ?? null,
              previousComponentCode: claim.payrollComponentCode,
              reason: d.reason.trim(),
            }),
          },
        });
        await audit(tx, m, action, claimId);
        return {
          data: {
            claimId,
            runId: componentCode ? runId : null,
            componentCode: componentCode ?? null,
          },
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
@ApiBearerAuth()
@ApiTags('payroll-claims')
@Roles('OWNER', 'FINANCE')
@Controller('payroll/runs/:runId/claims/:claimId')
export class ClaimAllocationController {
  constructor(private service: ClaimAllocationService) {}
  @Post('allocate')
  @ApiCreatedResponse({ type: ClaimAllocationResponseDto })
  @ApiOperation({
    summary:
      'Allocate an approved PAYROLL claim to one draft run and earning definition',
  })
  allocate(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() d: ClaimAllocationDto,
  ) {
    return this.service.change(
      r.membership,
      runId,
      claimId,
      d,
      d.componentCode,
    );
  }
  @Post('release')
  @ApiCreatedResponse({ type: ClaimAllocationResponseDto })
  @ApiOperation({
    summary:
      'Release a draft-run allocation; retain the claim decision and allocation history',
  })
  release(
    @Req() r: TenantRequest,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() d: ClaimAllocationReasonDto,
  ) {
    return this.service.change(r.membership, runId, claimId, d);
  }
}
@Module({
  controllers: [ClaimAllocationController],
  providers: [ClaimAllocationService],
})
export class ClaimAllocationModule {}
