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
} from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
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
  @ApiPropertyOptional() @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() positionId?: string;
}
export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 200)
  name?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsEmail() email?:
    string | null;
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
        if (
          dto.departmentId &&
          !(await tx.department.findFirst({
            where: { id: dto.departmentId, companyId, active: true },
          }))
        )
          throw new NotFoundException('Department not found.');
        if (dto.positionId) {
          const position = await tx.position.findFirst({
            where: { id: dto.positionId, companyId, active: true },
          });
          if (!position) throw new NotFoundException('Position not found.');
          if (position.departmentId !== dto.departmentId)
            throw new UnprocessableEntityException(
              'Position must belong to the selected department.',
            );
        }
        return {
          data: await tx.employee.create({
            data: {
              ...dto,
              companyId,
              joinedDate: new Date(dto.joinedDate + 'T00:00:00.000Z'),
            },
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async update(companyId: string, id: string, dto: UpdateEmployeeDto) {
    return {
      data: await this.db.employee.update({
        where: { companyId_id: { companyId, id } },
        data: dto,
      }),
    };
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
