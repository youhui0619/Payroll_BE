import { Injectable, NotFoundException } from '@nestjs/common';
import { Membership, Prisma } from '@prisma/client';
import { Database } from '../database.module';
import { paginated } from '../common/page.dto';
import {
  NotificationQueryDto,
  NotificationReadResponseDto,
} from './notifications.dto';

export type NotificationCreate = {
  companyId: string;
  userId: string;
  kind: string;
  title: string;
  message: string;
  dedupeKey?: string;
  sourceType?: string;
  sourceId?: string;
  payload?: Prisma.InputJsonValue;
};

export async function createNotificationInTransaction(
  tx: Prisma.TransactionClient,
  input: NotificationCreate,
) {
  const where = input.dedupeKey
    ? {
        companyId_userId_dedupeKey: {
          companyId: input.companyId,
          userId: input.userId,
          dedupeKey: input.dedupeKey,
        },
      }
    : undefined;
  const data = {
    companyId: input.companyId,
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    message: input.message,
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(input.sourceType ? { sourceType: input.sourceType } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.payload ? { payload: input.payload } : {}),
  };
  if (!where) return tx.notification.create({ data });
  return tx.notification.upsert({ where, create: data, update: {} });
}

export async function notifyEmployeeInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<NotificationCreate, 'userId'> & {
    employeeId: string;
    settingKey?: 'leaveApplications' | 'claims' | 'payrollPayslips';
  },
) {
  if (!tx.membership?.findFirst) return;
  const membership = await tx.membership.findFirst({
    where: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      active: true,
    },
    select: { userId: true },
  });
  if (!membership) return;
  if (input.settingKey && tx.notificationSettings?.findUnique) {
    const settings = await tx.notificationSettings.findUnique({
      where: { companyId: input.companyId },
      select: { [input.settingKey]: true },
    });
    if (settings && settings[input.settingKey] === false) return;
  }
  const {
    employeeId: _employeeId,
    settingKey: _settingKey,
    ...notification
  } = input;
  void _employeeId;
  void _settingKey;
  return createNotificationInTransaction(tx, {
    ...notification,
    userId: membership.userId,
  });
}

@Injectable()
export class NotificationsService {
  constructor(private db: Database) {}

  private item(row: any) {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      message: row.message,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      sourceType: row.sourceType ?? null,
      sourceId: row.sourceId ?? null,
      payload: row.payload ?? null,
    };
  }

  async list(m: Membership, q: NotificationQueryDto) {
    const where = {
      companyId: m.companyId,
      userId: m.userId,
      ...(q.unreadOnly ? { readAt: null } : {}),
    };
    const [rows, total, unread] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.notification.count({ where }),
      this.db.notification.count({
        where: { companyId: m.companyId, userId: m.userId, readAt: null },
      }),
    ]);
    return paginated(
      rows.map((row) => this.item(row)),
      total,
      q,
      { unreadCount: unread },
    );
  }

  async read(m: Membership, id: string) {
    const data = await this.db.$transaction(async (tx) => {
      const row = await tx.notification.findUnique({
        where: { companyId_id: { companyId: m.companyId, id } },
      });
      if (!row || row.userId !== m.userId) throw new NotFoundException();
      return tx.notification.update({
        where: { companyId_id: { companyId: m.companyId, id } },
        data: { readAt: row.readAt ?? new Date() },
      });
    });
    return { data: this.item(data) } as NotificationReadResponseDto;
  }

  async readAll(m: Membership) {
    const result = await this.db.notification.updateMany({
      where: { companyId: m.companyId, userId: m.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { data: { updatedCount: result.count } };
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    input: NotificationCreate,
  ) {
    return createNotificationInTransaction(tx, input);
  }
}
