import { SettingsService } from './settings.service';

const membership = {
  id: 'membership',
  userId: 'user',
  companyId: 'company',
  employeeId: null,
  roles: ['OWNER'],
  active: true,
} as any;

function database() {
  const db: any = {
    notificationSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    regionalSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    payslipSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((callback: (tx: any) => unknown) =>
    callback(db),
  );
  return db;
}

describe('SettingsService', () => {
  it('updates notification settings with tenant scope and audit', async () => {
    const db = database();
    db.notificationSettings.upsert.mockResolvedValue({ id: 'settings' });

    await new SettingsService(db).updateNotifications(membership, {
      emailNotifications: false,
      probationConfirmationLeadMonths: 3,
    });

    expect(db.notificationSettings.upsert).toHaveBeenCalledWith({
      where: { companyId: 'company' },
      create: {
        companyId: 'company',
        emailNotifications: false,
        probationConfirmationLeadMonths: 3,
      },
      update: {
        emailNotifications: false,
        probationConfirmationLeadMonths: 3,
      },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company',
        actorId: 'user',
        action: 'NOTIFICATION_SETTINGS_UPDATED',
        resourceId: 'settings',
      },
    });
  });
});
