import {
  Body,
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Membership, Role } from '@prisma/client';
import { Database } from '../database.module';
import { Roles, TenantRequest } from './auth.module';
import { hashPassword } from './password';
import { audit, fail } from '../common/domain';
import { PageDto, paginated } from '../common/page.dto';

export class CreateMemberDto {
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
  @ApiProperty({ enum: Role, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles: Role[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
}
export class UpdateMemberDto {
  @ApiProperty({ enum: Role, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles: Role[];
  @ApiProperty() @IsBoolean() active: boolean;
}
const selection = {
  id: true,
  companyId: true,
  userId: true,
  employeeId: true,
  roles: true,
  active: true,
  user: { select: { email: true } },
} as const;
@Injectable()
export class MembershipsService {
  constructor(private db: Database) {}
  async list(m: Membership, q: PageDto) {
    const where = { companyId: m.companyId };
    const [data, total] = await this.db.$transaction([
      this.db.membership.findMany({
        where,
        select: selection,
        orderBy: { id: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.membership.count({ where }),
    ]);
    return paginated(data, total, q);
  }
  async create(m: Membership, d: CreateMemberDto) {
    const passwordHash = await hashPassword(d.password);
    return this.db.$transaction(
      async (tx) => {
        if (d.employeeId) {
          const employee = await tx.employee.findFirst({
            where: { companyId: m.companyId, id: d.employeeId, active: true },
          });
          if (!employee)
            throw new NotFoundException('Active employee not found.');
        }
        const existing = await tx.user.findUnique({
          where: { email: d.email },
        });
        if (existing)
          fail(
            'ACCOUNT_EXISTS',
            'This email is already registered. Existing accounts cannot be attached through this endpoint.',
            409,
          );
        const user = await tx.user.create({
          data: { email: d.email, passwordHash },
        });
        const data = await tx.membership.create({
          data: {
            companyId: m.companyId,
            userId: user.id,
            employeeId: d.employeeId,
            roles: d.roles,
          },
          select: selection,
        });
        await audit(tx, m, 'MEMBERSHIP_CREATED', data.id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async update(m: Membership, id: string, d: UpdateMemberDto) {
    return this.db.$transaction(
      async (tx) => {
        const row = await tx.membership.findFirst({
          where: { id, companyId: m.companyId },
        });
        if (!row) throw new NotFoundException();
        if (
          row.userId === m.userId &&
          (!d.active || !d.roles.includes('OWNER'))
        )
          fail(
            'SELF_ACCESS_REMOVAL',
            'Another owner must remove your owner access.',
            409,
          );
        if (
          row.active &&
          row.roles.includes('OWNER') &&
          (!d.active || !d.roles.includes('OWNER'))
        ) {
          const others = await tx.membership.count({
            where: {
              companyId: m.companyId,
              id: { not: id },
              active: true,
              roles: { has: 'OWNER' },
              user: { active: true },
            },
          });
          if (!others)
            fail('LAST_OWNER', 'Keep at least one active owner.', 409);
        }
        const data = await tx.membership.update({
          where: { id },
          data: { active: d.active, roles: d.roles },
          select: selection,
        });
        await audit(tx, m, 'MEMBERSHIP_ACCESS_UPDATED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
@ApiBearerAuth()
@ApiTags('memberships')
@Roles('OWNER')
@Controller('memberships')
export class MembershipsController {
  constructor(private service: MembershipsService) {}
  @Get() list(@Req() r: TenantRequest, @Query() q: PageDto) {
    return this.service.list(r.membership, q);
  }
  @Post() create(@Req() r: TenantRequest, @Body() d: CreateMemberDto) {
    return this.service.create(r.membership, d);
  }
  @Patch(':id') update(
    @Req() r: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateMemberDto,
  ) {
    return this.service.update(r.membership, id, d);
  }
}
@Module({
  controllers: [MembershipsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
