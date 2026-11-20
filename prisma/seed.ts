import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';
import {
  EMPLOYMENT_TYPE_VALUES,
  type EmploymentType,
} from '../src/workforce/employment-types';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const workingDay = (
  dayName: string,
  isWorkingDay: boolean,
  startTime: string,
  endTime: string,
  breakStartTime = '',
  breakEndTime = '',
) => ({
  day: dayName,
  isWorkingDay,
  startTime,
  endTime,
  breakStartTime,
  breakEndTime,
});

const scheduleDays = (options: {
  weekdayStart: string;
  weekdayEnd: string;
  weekdayBreakStart?: string;
  weekdayBreakEnd?: string;
  saturdayWorking: boolean;
  saturdayStart: string;
  saturdayEnd: string;
}) => ({
  days: [
    ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((name) =>
      workingDay(
        name,
        true,
        options.weekdayStart,
        options.weekdayEnd,
        options.weekdayBreakStart,
        options.weekdayBreakEnd,
      ),
    ),
    workingDay(
      'Saturday',
      options.saturdayWorking,
      options.saturdayStart,
      options.saturdayEnd,
    ),
    workingDay('Sunday', false, '09:00', '18:00'),
  ],
});

const standardScheduleDays = scheduleDays({
  weekdayStart: '09:00',
  weekdayEnd: '18:00',
  weekdayBreakStart: '13:00',
  weekdayBreakEnd: '14:00',
  saturdayWorking: true,
  saturdayStart: '09:00',
  saturdayEnd: '13:00',
});
const partTimeScheduleDays = scheduleDays({
  weekdayStart: '09:00',
  weekdayEnd: '13:00',
  saturdayWorking: false,
  saturdayStart: '09:00',
  saturdayEnd: '18:00',
});
const freelanceScheduleDays = scheduleDays({
  weekdayStart: '10:00',
  weekdayEnd: '18:00',
  saturdayWorking: true,
  saturdayStart: '10:00',
  saturdayEnd: '18:00',
});
const casualScheduleDays = scheduleDays({
  weekdayStart: '09:00',
  weekdayEnd: '17:00',
  weekdayBreakStart: '13:00',
  weekdayBreakEnd: '14:00',
  saturdayWorking: true,
  saturdayStart: '09:00',
  saturdayEnd: '13:00',
});

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
      const positionIds = new Map<string, string>();
      for (const row of departmentRows) {
        const department = await tx.department.upsert({
          where: {
            companyId_code: { companyId: company.id, code: row.code },
          },
          create: {
            companyId: company.id,
            ...row,
            status: 'ACTIVE',
            active: true,
            effectiveFrom: day('2026-01-01'),
          },
          update: {},
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
        const positionRow = await tx.position.upsert({
          where: {
            companyId_code: { companyId: company.id, code: position.code },
          },
          create: {
            companyId: company.id,
            departmentId: departmentIds.get(departmentCode) ?? null,
            ...position,
            active: true,
            effectiveFrom: day('2026-01-01'),
          },
          update: {},
        });
        positionIds.set(position.code, positionRow.id);
      }

      const location = await tx.workLocation.upsert({
        where: {
          companyId_code: { companyId: company.id, code: 'HQ-KL' },
        },
        create: {
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
        update: {},
      });

      const scheduleRows: Array<{
        code: string;
        name: string;
        employmentType: EmploymentType;
        workingDays: number[];
        startMinute: number;
        endMinute: number;
        breakMinutes: number;
        graceMinutes: number;
        scheduleDays: Record<string, unknown>;
      }> = [
        {
          code: 'STANDARD-5D',
          name: 'Permanent - Standard Week',
          employmentType: 'PERMANENT',
          workingDays: [1, 2, 3, 4, 5, 6],
          startMinute: 540,
          endMinute: 1080,
          breakMinutes: 60,
          graceMinutes: 15,
          scheduleDays: standardScheduleDays,
        },
        {
          code: 'CONTRACT-5D',
          name: 'Contract - Standard Week',
          employmentType: 'CONTRACT',
          workingDays: [1, 2, 3, 4, 5, 6],
          startMinute: 540,
          endMinute: 1080,
          breakMinutes: 60,
          graceMinutes: 15,
          scheduleDays: standardScheduleDays,
        },
        {
          code: 'PART-TIME-4H',
          name: 'Part-time - Morning Shift',
          employmentType: 'PART-TIME',
          workingDays: [1, 2, 3, 4, 5],
          startMinute: 540,
          endMinute: 780,
          breakMinutes: 0,
          graceMinutes: 15,
          scheduleDays: partTimeScheduleDays,
        },
        {
          code: 'INTERN-5D',
          name: 'Intern - Standard Week',
          employmentType: 'INTERN',
          workingDays: [1, 2, 3, 4, 5, 6],
          startMinute: 540,
          endMinute: 1080,
          breakMinutes: 60,
          graceMinutes: 15,
          scheduleDays: standardScheduleDays,
        },
        {
          code: 'TEMPORARY-5D',
          name: 'Temporary - Standard Week',
          employmentType: 'TEMPORARY',
          workingDays: [1, 2, 3, 4, 5, 6],
          startMinute: 540,
          endMinute: 1080,
          breakMinutes: 60,
          graceMinutes: 15,
          scheduleDays: standardScheduleDays,
        },
        {
          code: 'TRAINEE-5D',
          name: 'Trainee - Standard Week',
          employmentType: 'TRAINEE',
          workingDays: [1, 2, 3, 4, 5, 6],
          startMinute: 540,
          endMinute: 1080,
          breakMinutes: 60,
          graceMinutes: 15,
          scheduleDays: standardScheduleDays,
        },
        {
          code: 'FREELANCE-6D',
          name: 'Freelance - Flexible Week',
          employmentType: 'FREELANCE',
          workingDays: [1, 2, 3, 4, 5, 6],
          startMinute: 600,
          endMinute: 1080,
          breakMinutes: 0,
          graceMinutes: 0,
          scheduleDays: freelanceScheduleDays,
        },
        {
          code: 'CASUAL-6D',
          name: 'Casual - Daily Worker',
          employmentType: 'CASUAL',
          workingDays: [1, 2, 3, 4, 5, 6],
          startMinute: 540,
          endMinute: 1020,
          breakMinutes: 60,
          graceMinutes: 15,
          scheduleDays: casualScheduleDays,
        },
      ];
      const seededEmploymentTypes = new Set(
        scheduleRows.map((row) => row.employmentType),
      );
      const missingEmploymentTypes = EMPLOYMENT_TYPE_VALUES.filter(
        (type) => !seededEmploymentTypes.has(type),
      );
      if (missingEmploymentTypes.length) {
        throw new Error(
          `Missing seeded work schedules for: ${missingEmploymentTypes.join(', ')}`,
        );
      }
      const scheduleIds = new Map<EmploymentType, string>();
      for (const row of scheduleRows) {
        const { scheduleDays: days, ...schedule } = row;
        const scheduleRow = await tx.workSchedule.upsert({
          where: {
            companyId_code: { companyId: company.id, code: row.code },
          },
          create: {
            companyId: company.id,
            ...schedule,
            scheduleDays: days as Prisma.InputJsonValue,
            effectiveFrom: day('2026-01-01'),
            active: true,
          },
          update: {},
        });
        scheduleIds.set(row.employmentType, scheduleRow.id);
      }

      const managerRows = [
        {
          employeeNo: 'MGR-FIN',
          name: 'Finance Manager',
          departmentCode: 'FIN',
          positionCode: 'FIN-MGR',
        },
        {
          employeeNo: 'MGR-HR',
          name: 'Human Resources Manager',
          departmentCode: 'HR',
          positionCode: 'HR-MGR',
        },
        {
          employeeNo: 'MGR-OPS',
          name: 'Operations Manager',
          departmentCode: 'OPS',
          positionCode: 'OPS-MGR',
        },
        {
          employeeNo: 'MGR-IT',
          name: 'IT Manager',
          departmentCode: 'IT',
          positionCode: 'IT-MGR',
        },
      ];
      for (const row of managerRows) {
        const positionId = positionIds.get(row.positionCode);
        const scheduleId = scheduleIds.get('PERMANENT');
        if (!positionId || !scheduleId)
          throw new Error(`Missing seed reference for ${row.employeeNo}.`);
        await tx.employee.upsert({
          where: {
            companyId_employeeNo: {
              companyId: company.id,
              employeeNo: row.employeeNo,
            },
          },
          create: {
            companyId: company.id,
            employeeNo: row.employeeNo,
            name: row.name,
            joinedDate: day('2026-01-01'),
            active: true,
            departmentId: departmentIds.get(row.departmentCode) ?? null,
            positionId,
            locationId: location.id,
            scheduleId,
            employmentStatus: 'ACTIVE',
            employmentType: 'PERMANENT',
          },
          update: {},
        });
      }

      await tx.leavePolicy.createMany({
        skipDuplicates: true,
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
        skipDuplicates: true,
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

      const holidayRows = [
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
      ];
      for (const holiday of holidayRows) {
        const existing = await tx.publicHoliday.findFirst({
          where: {
            companyId: company.id,
            name: holiday.name,
            startDate: holiday.startDate,
            endDate: holiday.endDate,
          },
        });
        if (!existing) {
          await tx.publicHoliday.create({ data: holiday });
        }
      }
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
