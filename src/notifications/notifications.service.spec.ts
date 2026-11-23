import { Membership } from '@prisma/client';
import { NotificationsService } from './notifications.service';

const member = {
  companyId: 'company',
  userId: 'user',
} as Membership;

describe('notifications', () => {
  it('lists only the signed-in user tenant notifications and unread count', async () => {
    const db: any = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'n1',
            kind: 'PAYSLIP_PUBLISHED',
            title: 'Payslip published',
            message: 'Ready',
            readAt: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            sourceType: 'PAYROLL_RUN',
            sourceId: 'run',
            payload: { runId: 'run' },
          },
        ]),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
      },
    };
    const result = await new NotificationsService(db).list(member, {
      page: 1,
      pageSize: 20,
      unreadOnly: true,
    });
    expect(result.data[0]).toMatchObject({
      id: 'n1',
      kind: 'PAYSLIP_PUBLISHED',
    });
    expect(result.meta.unreadCount).toBe(1);
    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company', userId: 'user', readAt: null },
      }),
    );
  });

  it('marks one owned notification read and rejects another user', async () => {
    const row = {
      id: 'n1',
      userId: 'user',
      readAt: null,
      kind: 'INFO',
      title: 'Title',
      message: 'Message',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const tx: any = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({ ...row, readAt: new Date() }),
      },
    };
    const db: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const result = await new NotificationsService(db).read(member, 'n1');
    expect(result.data.readAt).toBeTruthy();
    tx.notification.findUnique.mockResolvedValue({ ...row, userId: 'other' });
    await expect(
      new NotificationsService(db).read(member, 'n1'),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
