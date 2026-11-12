import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from '../auth/auth.module';
import { PageDto, paginated } from '../common/page.dto';
import {
  EmployeeAccountsService,
  CreateEmployeeAccountDto,
} from './employee-accounts.service';

export class CreateEmployeeDto {
  @ApiProperty() @IsString() @Length(1, 30) employeeNo: string;
  @ApiProperty() @IsString() @Length(1, 200) name: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  joinedDate: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() positionId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() managerId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() locationId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() scheduleId?:
    string | null;

  // Personal Information
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nricPassportNo?: string;
  @ApiPropertyOptional({ example: '1990-01-01', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  gender?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) race?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  religion?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 30)
  maritalStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) tin?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine1?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine2?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postcode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  state?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  country?: string;

  // Employment Details
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  employmentStatus?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  employmentType?: string;
  @ApiPropertyOptional({ example: '2026-04-01', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  confirmationDate?: string | null;
  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  resignationDate?: string | null;

  // Banking & Payroll
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  salaryType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  paymentMethod?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  bank?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  bankAccount?: string;

  // Statutory Identifiers & Rates
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  epfEmployeeNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  epfEmployerNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  epfRate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  kwspNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  socsoNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  contributionCategory?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  eisStatus?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  hrdRegisterNo?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statutoryEntitlementCodes?: string[];

  // Overtime Settings
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeOvertime?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  overtimeCalculationBasis?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overtimeHourlyRate?: number;

  // Emergency Contact
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  emergencyContactRelationship?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  emergencyContactNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  emergencyContactAddressLine1?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  emergencyContactAddressLine2?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactCity?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  emergencyContactPostcode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactState?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactCountry?: string;

  // Leave & Commission Assignments
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leavePolicyCodes?: string[];
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  leaveEntitlementOverrides?: Record<string, any>;
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  leaveServiceEntitlementTiers?: Record<string, any>;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  medicalLeaveEntitlement?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  medicalLeavePeriod?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commissionSettingCodes?: string[];
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SalaryDto {
  @ApiProperty({
    example: '3500.00',
    description:
      'Non-negative decimal string; at most 12 integer digits and 2 decimal places.',
  })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/)
  amount: string;
  @ApiProperty({
    example: '2026-11-01',
    description:
      'Inclusive start date; the prior salary ends exclusively on this date.',
  })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom: string;
}
@Injectable()
export class EmployeesService {
  constructor(private db: Database) {}
  private async validateReferences(
    tx: Prisma.TransactionClient,
    companyId: string,
    dto: Pick<
      CreateEmployeeDto,
      'departmentId' | 'positionId' | 'managerId' | 'locationId' | 'scheduleId'
    >,
    currentDepartmentId?: string | null,
    employeeId?: string,
  ) {
    const departmentId =
      dto.departmentId !== undefined ? dto.departmentId : currentDepartmentId;
    if (dto.departmentId) {
      const department = await tx.department.findFirst({
        where: { id: dto.departmentId, companyId, active: true },
      });
      if (!department) throw new NotFoundException('Department not found.');
    }
    if (dto.positionId) {
      const position = await tx.position.findFirst({
        where: { id: dto.positionId, companyId, active: true },
      });
      if (!position) throw new NotFoundException('Position not found.');
      if (!departmentId || position.departmentId !== departmentId)
        throw new UnprocessableEntityException(
          'Position must belong to the selected department.',
        );
    }
    if (dto.managerId) {
      if (dto.managerId === employeeId)
        throw new UnprocessableEntityException(
          'An employee cannot report to themself.',
        );
      const manager = await tx.employee.findFirst({
        where: { id: dto.managerId, companyId, active: true },
      });
      if (!manager) throw new NotFoundException('Manager not found.');
    }
    if (dto.locationId) {
      const location = await tx.workLocation.findFirst({
        where: { id: dto.locationId, companyId, active: true },
      });
      if (!location) throw new NotFoundException('Location not found.');
    }
    if (dto.scheduleId) {
      const schedule = await tx.workSchedule.findFirst({
        where: { id: dto.scheduleId, companyId, active: true },
      });
      if (!schedule) throw new NotFoundException('Schedule not found.');
    }
  }
  async list(companyId: string, q: PageDto) {
    const where = {
      companyId,
      ...(q.search
        ? { name: { contains: q.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.employee.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.employee.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async get(companyId: string, id: string) {
    const data = await this.db.employee.findUnique({
      where: { companyId_id: { companyId, id } },
    });
    if (!data) throw new NotFoundException();
    return { data };
  }
  async create(companyId: string, dto: CreateEmployeeDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.validateReferences(tx, companyId, dto);

        const {
          joinedDate,
          dateOfBirth,
          confirmationDate,
          resignationDate,
          overtimeHourlyRate,
          medicalLeaveEntitlement,
          ...rest
        } = dto;

        return {
          data: await tx.employee.create({
            data: {
              ...rest,
              companyId,
              joinedDate: new Date(joinedDate + 'T00:00:00.000Z'),
              ...(dateOfBirth !== undefined
                ? {
                    dateOfBirth: dateOfBirth
                      ? new Date(dateOfBirth + 'T00:00:00.000Z')
                      : null,
                  }
                : {}),
              ...(confirmationDate !== undefined
                ? {
                    confirmationDate: confirmationDate
                      ? new Date(confirmationDate + 'T00:00:00.000Z')
                      : null,
                  }
                : {}),
              ...(resignationDate !== undefined
                ? {
                    resignationDate: resignationDate
                      ? new Date(resignationDate + 'T00:00:00.000Z')
                      : null,
                  }
                : {}),
              ...(overtimeHourlyRate !== undefined &&
              overtimeHourlyRate !== null
                ? { overtimeHourlyRate: new Prisma.Decimal(overtimeHourlyRate) }
                : {}),
              ...(medicalLeaveEntitlement !== undefined &&
              medicalLeaveEntitlement !== null
                ? {
                    medicalLeaveEntitlement: new Prisma.Decimal(
                      medicalLeaveEntitlement,
                    ),
                  }
                : {}),
            },
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async update(companyId: string, id: string, dto: UpdateEmployeeDto) {
    const referencesChanged =
      dto.departmentId !== undefined ||
      dto.positionId !== undefined ||
      dto.managerId !== undefined ||
      dto.locationId !== undefined ||
      dto.scheduleId !== undefined;
    const current = referencesChanged
      ? await this.db.employee.findUnique({
          where: { companyId_id: { companyId, id } },
          select: { departmentId: true },
        })
      : null;
    if (referencesChanged && !current) throw new NotFoundException();
    const {
      joinedDate,
      dateOfBirth,
      confirmationDate,
      resignationDate,
      overtimeHourlyRate,
      medicalLeaveEntitlement,
      ...rest
    } = dto;

    return this.db.$transaction(async (tx) => {
      await this.validateReferences(
        tx,
        companyId,
        dto,
        current?.departmentId,
        id,
      );
      return {
        data: await tx.employee.update({
          where: { companyId_id: { companyId, id } },
          data: {
            ...rest,
            ...(joinedDate !== undefined
              ? {
                  joinedDate: joinedDate
                    ? new Date(joinedDate + 'T00:00:00.000Z')
                    : undefined,
                }
              : {}),
            ...(dateOfBirth !== undefined
              ? {
                  dateOfBirth: dateOfBirth
                    ? new Date(dateOfBirth + 'T00:00:00.000Z')
                    : null,
                }
              : {}),
            ...(confirmationDate !== undefined
              ? {
                  confirmationDate: confirmationDate
                    ? new Date(confirmationDate + 'T00:00:00.000Z')
                    : null,
                }
              : {}),
            ...(resignationDate !== undefined
              ? {
                  resignationDate: resignationDate
                    ? new Date(resignationDate + 'T00:00:00.000Z')
                    : null,
                }
              : {}),
            ...(overtimeHourlyRate !== undefined
              ? {
                  overtimeHourlyRate:
                    overtimeHourlyRate !== null
                      ? new Prisma.Decimal(overtimeHourlyRate)
                      : null,
                }
              : {}),
            ...(medicalLeaveEntitlement !== undefined
              ? {
                  medicalLeaveEntitlement:
                    medicalLeaveEntitlement !== null
                      ? new Prisma.Decimal(medicalLeaveEntitlement)
                      : null,
                }
              : {}),
          },
        }),
      };
    });
  }
  async salaries(companyId: string, id: string, q: PageDto) {
    await this.get(companyId, id);
    const where = { companyId, employeeId: id };
    const [data, total] = await this.db.$transaction([
      this.db.salaryHistory.findMany({
        where,
        orderBy: { effectiveFrom: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.salaryHistory.count({ where }),
    ]);
    return paginated(
      data.map((row) => ({ ...row, amount: row.amount.toFixed(2) })),
      total,
      q,
    );
  }
  async addSalary(companyId: string, id: string, dto: SalaryDto) {
    return this.db.$transaction(
      async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { companyId_id: { companyId, id } },
        });
        if (!employee) throw new NotFoundException();
        const from = new Date(dto.effectiveFrom + 'T00:00:00.000Z');
        if (from < employee.joinedDate)
          throw new UnprocessableEntityException(
            'Salary cannot start before employment.',
          );
        const latest = await tx.salaryHistory.findFirst({
          where: { companyId, employeeId: id },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (latest && from <= latest.effectiveFrom)
          throw new UnprocessableEntityException(
            'New salary must start after the latest salary record.',
          );
        const locked = await tx.payrollRun.count({
          where: {
            companyId,
            status: { not: 'DRAFT' },
            OR: [
              { year: { gt: from.getUTCFullYear() } },
              {
                year: from.getUTCFullYear(),
                month: { gte: from.getUTCMonth() + 1 },
              },
            ],
          },
        });
        if (locked)
          throw new ConflictException(
            'Salary changes cannot affect a calculated or finalized payroll period.',
          );
        // Intervals are [effectiveFrom, effectiveTo); the next salary begins at the previous end.
        if (latest)
          await tx.salaryHistory.update({
            where: { id: latest.id },
            data: { effectiveTo: from },
          });
        const row = await tx.salaryHistory.create({
          data: {
            companyId,
            employeeId: id,
            amount: dto.amount,
            effectiveFrom: from,
          },
        });
        return { data: { ...row, amount: row.amount.toFixed(2) } };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
@ApiBearerAuth()
@ApiTags('employees')
@Roles('OWNER', 'HR')
@Controller('employees')
export class EmployeesController {
  constructor(
    private service: EmployeesService,
    private accounts: EmployeeAccountsService,
  ) {}
  @Get('me') @Roles('OWNER', 'HR', 'FINANCE', 'EMPLOYEE') me(
    @Req() req: TenantRequest,
  ) {
    return this.accounts.me(req.membership.companyId, req.membership.id);
  }
  @Post(':id/account') createAccount(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEmployeeAccountDto,
  ) {
    return this.accounts.create(req.membership.companyId, id, dto);
  }
  @Get() list(@Req() req: TenantRequest, @Query() q: PageDto) {
    return this.service.list(req.membership.companyId, q);
  }
  @Get(':id') get(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(req.membership.companyId, id);
  }
  @Post() create(@Req() req: TenantRequest, @Body() dto: CreateEmployeeDto) {
    return this.service.create(req.membership.companyId, dto);
  }
  @Patch(':id') update(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.update(req.membership.companyId, id, dto);
  }
  @Get(':id/salaries') @Roles('OWNER', 'HR', 'FINANCE') salaries(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.salaries(req.membership.companyId, id, q);
  }
  @Post(':id/salaries') @Roles('OWNER', 'HR') addSalary(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryDto,
  ) {
    return this.service.addSalary(req.membership.companyId, id, dto);
  }
}
@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeAccountsService],
})
export class EmployeesModule {}
