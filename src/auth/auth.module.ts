import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Global,
  HttpCode,
  Injectable,
  Module,
  Post,
  Req,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { LoginLimitGuard } from './login-limit.guard';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Request } from 'express';
import { Database } from '../database.module';
import { hashPassword, verifyPassword } from './password';
import { Membership, Role } from '@prisma/client';

export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export type TenantRequest = Request & { membership: Membership };
class LoginDto {
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) password: string;
}
class PasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private db: Database,
    private jwt: JwtService,
    private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest<TenantRequest>();
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException();
    let token: {
      sub: string;
      membershipId: string;
      companyId: string;
      version: number;
    };
    try {
      token = await this.jwt.verifyAsync(authorization.slice(7), {
        algorithms: ['HS256'],
        issuer: 'payroll-api',
        audience: 'payroll-web',
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (
      !token.sub ||
      !token.membershipId ||
      !token.companyId ||
      !Number.isInteger(token.version)
    )
      throw new UnauthorizedException();
    const membership = await this.db.membership.findFirst({
      where: {
        id: token.membershipId,
        userId: token.sub,
        companyId: token.companyId,
        active: true,
        company: { active: true },
        user: { active: true, tokenVersion: token.version },
      },
    });
    if (!membership) throw new UnauthorizedException();
    req.membership = membership;
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles?.length && !roles.some((role) => membership.roles.includes(role)))
      throw new ForbiddenException();
    return true;
  }
}
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private db: Database,
    private jwt: JwtService,
  ) {}
  @Public()
  @UseGuards(LoginLimitGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    // Perform password derivation even for an unknown account.
    const fallback =
      'scrypt$00000000000000000000000000000000$' + '00'.repeat(64);
    const valid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? fallback,
    );
    if (
      !user ||
      !user.active ||
      (user.lockedUntil && user.lockedUntil > new Date())
    )
      throw new UnauthorizedException('Invalid credentials.');
    if (!valid) {
      const updated = await this.db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });
      if (updated.failedLoginCount >= 5)
        await this.db.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
        });
      throw new UnauthorizedException('Invalid credentials.');
    }
    const memberships = await this.db.membership.findMany({
      where: { userId: user.id, active: true, company: { active: true } },
      orderBy: { id: 'asc' },
    });
    if (memberships.length !== 1)
      throw new UnauthorizedException(
        'A single active company membership is required.',
      );
    await this.db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    const m = memberships[0];
    return {
      data: {
        accessToken: await this.jwt.signAsync({
          sub: user.id,
          membershipId: m.id,
          companyId: m.companyId,
          version: user.tokenVersion,
        }),
        tokenType: 'Bearer',
        expiresIn: Number(process.env.JWT_TTL_SECONDS ?? 3600),
      },
    };
  }
  @ApiBearerAuth()
  @Get('me')
  async me(@Req() req: TenantRequest) {
    const m = req.membership;
    return {
      data: {
        userId: m.userId,
        companyId: m.companyId,
        membershipId: m.id,
        employeeId: m.employeeId,
        roles: m.roles,
      },
    };
  }
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(@Req() req: TenantRequest, @Body() dto: PasswordDto) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: req.membership.userId },
    });
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Invalid credentials.');
    const updated = await this.db.user.updateMany({
      where: { id: user.id, tokenVersion: user.tokenVersion },
      data: {
        passwordHash: await hashPassword(dto.newPassword),
        tokenVersion: { increment: 1 },
      },
    });
    if (!updated.count)
      throw new UnauthorizedException('Account changed; please sign in again.');
  }
}
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        const ttl = Number(process.env.JWT_TTL_SECONDS ?? 3600);
        if (!secret || secret.length < 32 || secret.startsWith('replace-'))
          throw new Error('Set JWT_SECRET to at least 32 random characters.');
        if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400)
          throw new Error('Invalid JWT_TTL_SECONDS');
        return {
          secret,
          signOptions: {
            algorithm: 'HS256' as const,
            expiresIn: ttl,
            issuer: 'payroll-api',
            audience: 'payroll-web',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [LoginLimitGuard, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [JwtModule],
})
export class AuthModule {}
