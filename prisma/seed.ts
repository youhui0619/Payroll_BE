import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function seed() {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  const companyName = process.env.SEED_COMPANY_NAME;
  if (!email || !password || password.length < 8 || !companyName) {
    throw new Error(
      'Set SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD (8+ characters), and SEED_COMPANY_NAME.',
    );
  }

  const db = new PrismaClient();
  try {
    await db.$transaction(async (tx) => {
      const existingOwner = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          memberships: {
            where: { active: true, roles: { has: 'OWNER' } },
            select: { companyId: true },
            take: 1,
          },
        },
      });
      let companyId: string;
      if (existingOwner) {
        const membership = existingOwner.memberships[0];
        if (!membership)
          throw new Error(
            'Existing seed owner has no active OWNER membership for a company.',
          );
        companyId = membership.companyId;
      } else {
        const passwordHash = await hashPassword(password);
        const company = await tx.company.create({
          data: { name: companyName },
        });
        const user = await tx.user.create({
          data: { email, passwordHash, fullName: 'Company Owner' },
        });
        await tx.membership.create({
          data: { companyId: company.id, userId: user.id, roles: ['OWNER'] },
        });
        companyId = company.id;
      }
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
      });
      if (
        await tx.department.findUnique({
          where: { companyId_code: { companyId: company.id, code: 'CORP' } },
        })
      )
        return;

      const departmentRows = [
        {
          code: 'CORP',
          name: 'Corporate',
          description: 'Company-wide administration and leadership.',
        },
        {
          code: 'FIN',
          name: 'Finance',
          description: 'Accounting, payroll, and financial reporting.',
        },
        {
          code: 'HR',
          name: 'Human Resources',
          description: 'People operations and employee support.',
        },
        {
          code: 'OPS',
          name: 'Operations',
          description: 'Daily business and service operations.',
        },
        {
          code: 'IT',
          name: 'Information Technology',
          description: 'Internal systems and technical support.',
        },
      ];
      const departmentIds = new Map<string, string>();
      for (const row of departmentRows) {
        const department = await tx.department.create({
          data: {
            companyId: company.id,
            ...row,
            status: 'ACTIVE',
            active: true,
            effectiveFrom: day('2026-01-01'),
          },
        });
        departmentIds.set(row.code, department.id);
      }

      const positionRows = [
        {
          departmentCode: 'CORP',
          code: 'CORP-DIR',
          title: 'Corporate Director',
          jobLevel: 'DIRECTOR',
        },
        {
          departmentCode: 'FIN',
          code: 'FIN-MGR',
          title: 'Finance Manager',
          jobLevel: 'MANAGER',
        },
        {
          departmentCode: 'HR',
          code: 'HR-MGR',
          title: 'Human Resources Manager',
          jobLevel: 'MANAGER',
        },
        {
          departmentCode: 'OPS',
          code: 'OPS-MGR',
          title: 'Operations Manager',
          jobLevel: 'MANAGER',
        },
        {
          departmentCode: 'IT',
          code: 'IT-MGR',
          title: 'IT Manager',
          jobLevel: 'MANAGER',
        },
        {
          departmentCode: 'IT',
          code: 'IT-DEV',
          title: 'Software Developer',
          jobLevel: 'INTERMEDIATE',
        },
      ];
      for (const row of positionRows) {
        const { departmentCode, ...position } = row;
        await tx.position.create({
          data: {
            companyId: company.id,
            departmentId: departmentIds.get(departmentCode) ?? null,
            ...position,
            active: true,
            effectiveFrom: day('2026-01-01'),
          },
        });
      }

      await tx.workLocation.create({
        data: {
          companyId: company.id,
          code: 'HQ-KL',
          name: 'Kuala Lumpur Head Office',
          type: 'OFFICE',
          addressLine1: '12 Jalan Sultan Ismail',
          city: 'Kuala Lumpur',
          postcode: '50250',
          state: 'KUALA LUMPUR',
          country: 'MALAYSIA',
          timezone: 'Asia/Kuala_Lumpur',
          active: true,
        },
      });

      await tx.workSchedule.create({
        data: {
          companyId: company.id,
          code: 'STANDARD-5D',
          name: 'Standard 5-Day Week',
          workingDays: [1, 2, 3, 4, 5],
          startMinute: 540,
          endMinute: 1080,
          breakMinutes: 60,
          graceMinutes: 15,
          employmentType: 'Permanent',
          effectiveFrom: day('2026-01-01'),
          active: true,
        },
      });

      await tx.leavePolicy.createMany({
        data: [
          {
            companyId: company.id,
            code: 'AL',
            name: 'Annual Leave',
            description: 'Paid leave for rest and personal matters.',
            paid: true,
            active: true,
            entitlementUnit: 'DAILY',
            entitlementCalculationMethod: 'SERVICE',
            serviceEntitlementTiers: [
              { serviceFrom: 0, serviceTo: 2, daysPerYear: 8 },
              { serviceFrom: 2, serviceTo: 5, daysPerYear: 12 },
              { serviceFrom: 5, serviceTo: null, daysPerYear: 16 },
            ] as Prisma.InputJsonValue,
            entitlementGrantMethod: 'ANNUAL',
            eligibility: 'ALL_EMPLOYEES',
            leaveYear: 'CALENDAR',
            carryForwardPolicy: 'LIMITED',
            maximumCarryForward: new Prisma.Decimal('5.00'),
            requireSupportingDocuments: false,
            allowEmployeeSpecificSettings: true,
            annualDays: new Prisma.Decimal('14.00'),
            allowHalfDay: true,
            noticeDays: 3,
            approval: 'MANAGER_HR',
            effectiveFrom: day('2026-01-01'),
          },
          {
            companyId: company.id,
            code: 'ML',
            name: 'Medical Leave',
            description: 'Paid leave for illness and medical appointments.',
            paid: true,
            active: true,
            entitlementUnit: 'DAILY',
            entitlementCalculationMethod: 'FIXED',
            defaultEntitlement: new Prisma.Decimal('14.00'),
            entitlementGrantMethod: 'ANNUAL',
            eligibility: 'ALL_EMPLOYEES',
            leaveYear: 'CALENDAR',
            carryForwardPolicy: 'NONE',
            requireSupportingDocuments: true,
            allowEmployeeSpecificSettings: true,
            annualDays: new Prisma.Decimal('14.00'),
            allowHalfDay: true,
            noticeDays: 0,
            approval: 'HR_ONLY',
            effectiveFrom: day('2026-01-01'),
          },
          {
            companyId: company.id,
            code: 'UL',
            name: 'Unpaid Leave',
            description: 'Leave that does not consume paid leave balance.',
            paid: false,
            active: true,
            entitlementUnit: 'DAILY',
            entitlementCalculationMethod: 'FIXED',
            entitlementGrantMethod: 'MANUAL',
            eligibility: 'ALL_EMPLOYEES',
            leaveYear: 'CALENDAR',
            carryForwardPolicy: 'NONE',
            requireSupportingDocuments: false,
            allowEmployeeSpecificSettings: false,
            annualDays: new Prisma.Decimal('0.00'),
            allowHalfDay: true,
            noticeDays: 0,
            approval: 'MANAGER_HR',
            effectiveFrom: day('2026-01-01'),
          },
        ],
      });

      await tx.claimType.createMany({
        data: [
          {
            companyId: company.id,
            code: 'TRV',
            name: 'Travel',
            description: 'Travel fares and business transportation expenses.',
            active: true,
            receiptRequired: true,
            effectiveFrom: day('2026-01-01'),
          },
          {
            companyId: company.id,
            code: 'MEAL',
            name: 'Meals',
            description: 'Meals purchased during approved business activities.',
            active: true,
            receiptRequired: true,
            effectiveFrom: day('2026-01-01'),
          },
          {
            companyId: company.id,
            code: 'MED',
            name: 'Medical',
            description: 'Eligible medical expenses.',
            active: true,
            receiptRequired: true,
            effectiveFrom: day('2026-01-01'),
          },
          {
            companyId: company.id,
            code: 'OTH',
            name: 'Other',
            description: 'Other approved business expenses.',
            active: true,
            receiptRequired: false,
            effectiveFrom: day('2026-01-01'),
          },
        ],
      });

      await tx.publicHoliday.createMany({
        data: [
          {
            companyId: company.id,
            name: "Lunar New Year's Day",
            description: 'Chinese New Year public holiday.',
            scope: 'NATIONAL',
            startDate: day('2026-02-17'),
            endDate: day('2026-02-18'),
            states: [],
            regions: [],
            status: 'ACTIVE',
            active: true,
          },
          {
            companyId: company.id,
            name: 'Hari Raya Puasa',
            description: 'Hari Raya Puasa celebration.',
            scope: 'NATIONAL',
            startDate: day('2026-03-21'),
            endDate: day('2026-03-22'),
            states: [],
            regions: [],
            status: 'ACTIVE',
            active: true,
          },
          {
            companyId: company.id,
            name: 'Labour Day',
            description: 'Annual Labour Day public holiday.',
            scope: 'NATIONAL',
            startDate: day('2026-05-01'),
            endDate: day('2026-05-01'),
            states: [],
            regions: [],
            status: 'ACTIVE',
            active: true,
          },
          {
            companyId: company.id,
            name: 'Hari Thaipusam',
            description: 'State public holiday observed in selected locations.',
            scope: 'STATE',
            startDate: day('2026-02-01'),
            endDate: day('2026-02-01'),
            states: [],
            regions: [
              'Johor',
              'Kuala Lumpur',
              'Negeri Sembilan',
              'Penang',
              'Perak',
              'Putrajaya',
              'Selangor',
            ],
            status: 'ACTIVE',
            active: true,
          },
          {
            companyId: company.id,
            name: 'Gawai Dayak',
            description: 'Harvest festival public holiday in Sarawak.',
            scope: 'STATE',
            startDate: day('2026-06-01'),
            endDate: day('2026-06-02'),
            states: [],
            regions: ['Sarawak'],
            status: 'ACTIVE',
            active: true,
          },
          {
            companyId: company.id,
            name: 'Merdeka Day',
            description: 'Malaysia National Day.',
            scope: 'NATIONAL',
            startDate: day('2026-08-31'),
            endDate: day('2026-08-31'),
            states: [],
            regions: [],
            status: 'ACTIVE',
            active: true,
          },
        ],
      });
    });
  } finally {
    await db.$disconnect();
  }
}

void seed().catch(() => {
  console.error(
    'Seed failed. Check configuration and whether the owner already exists.',
  );
  process.exitCode = 1;
});
