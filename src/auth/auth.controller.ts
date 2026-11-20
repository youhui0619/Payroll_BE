import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { LoginLimitGuard } from './login-limit.guard';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Database } from '../database.module';
import { hashPassword, verifyPassword } from './password';
import { Public, TenantRequest } from './auth.decorators';
import { LoginDto, PasswordDto } from './auth.dto';

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
      include: { employee: { select: { name: true } } },
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
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      membershipId: m.id,
      companyId: m.companyId,
      version: user.tokenVersion,
    });
    const userSummary = {
      id: user.id,
      name: user.fullName || m.employee?.name || null,
      email: user.email,
      roles: m.roles,
      companyId: m.companyId,
      membershipId: m.id,
      employeeId: m.employeeId,
    };
    return {
      data: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: Number(process.env.JWT_TTL_SECONDS ?? 3600),
        user: userSummary,
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
