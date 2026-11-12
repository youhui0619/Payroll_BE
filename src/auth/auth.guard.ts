import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Database } from '../database.module';
import { Membership, Role } from '@prisma/client';
import { TenantRequest } from './auth.decorators';

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
    req.membership = membership as Membership;
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles?.length && !roles.some((role) => membership.roles.includes(role)))
      throw new ForbiddenException();
    return true;
  }
}
