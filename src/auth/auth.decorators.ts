import { SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { Membership, Role } from '@prisma/client';

export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export type TenantRequest = Request & { membership: Membership };
