import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { hashPassword } from './password';
import { audit, fail } from '../common/domain';
import { paginated } from '../common/page.dto';
import {
  ACTIVE_STATUS_VALUES,
  makeStatusCounts,
} from '../common/status-summary';
import {
  CreateMemberDto,
  MembershipQueryDto,
  UpdateMemberDto,
} from './memberships.dto';
import { membershipSelection } from './memberships.selection';

@Injectable()
export class MembershipsService {
  constructor(private db: Database) {}
  async list(m: Membership, q: MembershipQueryDto) {
    const search = q.search?.trim();
    const baseWhere = {
      companyId: m.companyId,
      ...(q.role ? { roles: { has: q.role } } : {}),
      ...(search
        ? {
            OR: [
              { id: search },
              {
                user: {
                  email: { contains: search, mode: 'insensitive' as const },
                },
              },
              {
                user: {
                  fullName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };
    const where = {
      ...baseWhere,
      ...(q.active !== undefined ? { active: q.active } : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.membership.findMany({
        where,
        select: membershipSelection,
        orderBy: { id: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.membership.count({ where }),
    ]);
    const statusCountValues = await Promise.all(
      ACTIVE_STATUS_VALUES.map((status) =>
        this.db.membership.count({
          where: { ...baseWhere, active: status === 'ACTIVE' },
        }),
      ),
    );
    return paginated(data, total, q, {
      summary: {
        statusCounts: makeStatusCounts(ACTIVE_STATUS_VALUES, statusCountValues),
      },
    });
  }
  async get(m: Membership, id: string) {
    const data = await this.db.membership.findFirst({
      where: { id, companyId: m.companyId },
      select: membershipSelection,
    });
    if (!data) throw new NotFoundException();
    return { data };
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
          data: { email: d.email, fullName: d.fullName, passwordHash },
        });
        const data = await tx.membership.create({
          data: {
            companyId: m.companyId,
            userId: user.id,
            employeeId: d.employeeId,
            roles: d.roles,
          },
          select: membershipSelection,
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
        if (d.fullName !== undefined)
          await tx.user.update({
            where: { id: row.userId },
            data: { fullName: d.fullName },
          });
        const data = await tx.membership.update({
          where: { id },
          data: { active: d.active, roles: d.roles },
          select: membershipSelection,
        });
        await audit(tx, m, 'MEMBERSHIP_ACCESS_UPDATED', id);
        return { data };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
