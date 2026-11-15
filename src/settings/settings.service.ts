import { Injectable } from '@nestjs/common';
import { Membership } from '@prisma/client';
import { Database } from '../database.module';
import { audit } from '../common/domain';
import {
  NotificationSettingsDto,
  PayslipSettingsDto,
  RegionalSettingsDto,
} from './settings.dto';

@Injectable()
export class SettingsService {
  constructor(private db: Database) {}

  async notifications(m: Membership) {
    return {
      data: await this.db.notificationSettings.findUnique({
        where: { companyId: m.companyId },
      }),
    };
  }

  async updateNotifications(m: Membership, dto: NotificationSettingsDto) {
    return this.db.$transaction(async (tx) => {
      const data = await tx.notificationSettings.upsert({
        where: { companyId: m.companyId },
        create: { companyId: m.companyId, ...dto },
        update: dto,
      });
      await audit(tx, m, 'NOTIFICATION_SETTINGS_UPDATED', data.id);
      return { data };
    });
  }

  async regional(m: Membership) {
    return {
      data: await this.db.regionalSettings.findUnique({
        where: { companyId: m.companyId },
      }),
    };
  }

  async updateRegional(m: Membership, dto: RegionalSettingsDto) {
    return this.db.$transaction(async (tx) => {
      const data = await tx.regionalSettings.upsert({
        where: { companyId: m.companyId },
        create: { companyId: m.companyId, ...dto },
        update: dto,
      });
      await audit(tx, m, 'REGIONAL_SETTINGS_UPDATED', data.id);
      return { data };
    });
  }

  async payslip(m: Membership) {
    return {
      data: await this.db.payslipSettings.findUnique({
        where: { companyId: m.companyId },
      }),
    };
  }

  async updatePayslip(m: Membership, dto: PayslipSettingsDto) {
    return this.db.$transaction(async (tx) => {
      const data = await tx.payslipSettings.upsert({
        where: { companyId: m.companyId },
        create: { companyId: m.companyId, ...dto },
        update: dto,
      });
      await audit(tx, m, 'PAYSLIP_SETTINGS_UPDATED', data.id);
      return { data };
    });
  }
}
