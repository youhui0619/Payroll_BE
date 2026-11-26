import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';
import {
  EMPLOYMENT_TYPE_VALUES,
  type EmploymentType,
} from '../src/workforce/employment-types';
import { accrualDays } from '../src/leave/leave-accrual';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function nextPublicHolidayCode(
  tx: Prisma.TransactionClient,
  companyId: string,
) {
  const existing = await tx.publicHoliday.findMany({
    where: { companyId },
    select: { code: true },
  });
  return existing.reduce((max, row) => Math.max(max, row.code), 0) + 1;
}

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
      let seedOwnerUserId: string;
      if (existingOwner) {
        const membership = existingOwner.memberships[0];
        if (!membership)
          throw new Error(
            'Existing seed owner has no active OWNER membership for a company.',
          );
        companyId = membership.companyId;
        seedOwnerUserId = existingOwner.id;
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
        seedOwnerUserId = user.id;
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
      const managerIds = new Map<string, string>();
      for (const row of managerRows) {
        const positionId = positionIds.get(row.positionCode);
        const scheduleId = scheduleIds.get('PERMANENT');
        if (!positionId || !scheduleId)
          throw new Error(`Missing seed reference for ${row.employeeNo}.`);
        const manager = await tx.employee.upsert({
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
        managerIds.set(row.employeeNo, manager.id);
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
            defaultEntitlement: new Prisma.Decimal('0.00'),
            entitlementGrantMethod: 'MANUAL',
            eligibility: 'ALL_EMPLOYEES',
            leaveYear: 'CALENDAR',
            carryForwardPolicy: 'NONE',
            requireSupportingDocuments: false,
            allowEmployeeSpecificSettings: false,
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
          await tx.publicHoliday.create({
            data: {
              ...holiday,
              code: await nextPublicHolidayCode(tx, company.id),
            },
          });
        }
      }

      const demoDepartmentId = departmentIds.get('IT');
      const demoPositionId = positionIds.get('IT-DEV');
      const demoScheduleId = scheduleIds.get('PERMANENT');
      const demoManagerId = managerIds.get('MGR-IT');
      if (
        !demoDepartmentId ||
        !demoPositionId ||
        !demoScheduleId ||
        !demoManagerId
      )
        throw new Error('Missing seed reference for E00001.');

      const demoEmployee = await tx.employee.upsert({
        where: {
          companyId_employeeNo: {
            companyId: company.id,
            employeeNo: 'E00001',
          },
        },
        create: {
          companyId: company.id,
          employeeNo: 'E00001',
          name: 'Demo Employee',
          email: 'demo.employee@example.test',
          joinedDate: day('2026-01-01'),
          active: true,
          departmentId: demoDepartmentId,
          positionId: demoPositionId,
          managerId: demoManagerId,
          locationId: location.id,
          scheduleId: demoScheduleId,
          employmentStatus: 'ACTIVE',
          employmentType: 'PERMANENT',
          nricPassportNo: '950615-14-0001',
          dateOfBirth: day('1995-06-15'),
          gender: 'MALE',
          nationality: 'MALAYSIAN',
          race: 'CHINESE',
          religion: 'BUDDHISM',
          maritalStatus: 'SINGLE',
          contactNo: '0123456789',
          addressLine1: '12 Jalan Sultan Ismail',
          city: 'Kuala Lumpur',
          postcode: '50250',
          state: 'KUALA LUMPUR',
          country: 'MALAYSIA',
          confirmationDate: day('2026-04-01'),
          salaryType: 'MONTHLY',
          paymentMethod: 'BANK',
          bank: 'MAYBANK',
          bankAccount: '1122334455',
          epfEmployeeNo: 'EPF-DEMO-0001',
          epfEmployerNo: 'EPF-EMPLOYER-0001',
          epfRate: '11',
          socsoNo: 'SOCSO-DEMO-0001',
          contributionCategory: 'CATEGORY1',
          eisStatus: 'ACTIVE',
          statutoryEntitlementCodes: ['EPF', 'SOCSO', 'EIS'],
          includeOvertime: true,
          overtimeCalculationBasis: 'DAILY_RATE_CONVERTED',
          emergencyContactName: 'Demo Contact',
          emergencyContactRelationship: 'PARENT',
          emergencyContactNo: '0139876543',
          emergencyContactAddressLine1: '12 Jalan Sultan Ismail',
          emergencyContactCity: 'Kuala Lumpur',
          emergencyContactPostcode: '50250',
          emergencyContactState: 'KUALA LUMPUR',
          emergencyContactCountry: 'MALAYSIA',
        },
        update: {},
      });

      await tx.employeeWorkSchedule.upsert({
        where: {
          companyId_employeeId: {
            companyId: company.id,
            employeeId: demoEmployee.id,
          },
        },
        create: {
          companyId: company.id,
          employeeId: demoEmployee.id,
          scheduleDays: standardScheduleDays as Prisma.InputJsonValue,
          effectiveFrom: day('2026-01-01'),
          active: true,
        },
        update: {},
      });

      await tx.salaryHistory.upsert({
        where: {
          companyId_employeeId_effectiveFrom: {
            companyId: company.id,
            employeeId: demoEmployee.id,
            effectiveFrom: day('2026-01-01'),
          },
        },
        create: {
          companyId: company.id,
          employeeId: demoEmployee.id,
          amount: new Prisma.Decimal('3500.00'),
          effectiveFrom: day('2026-01-01'),
        },
        update: {},
      });

      const demoAttendanceRows = [
        ['2026-11-02', '09:00', '18:00', 540, 480, 0, 'On time'],
        ['2026-11-03', '09:05', '18:00', 535, 475, 0, 'Late arrival'],
        ['2026-11-04', '09:00', '18:30', 570, 510, 30, 'Project deployment'],
        ['2026-11-05', '08:55', '18:00', 545, 485, 0, null],
        ['2026-11-06', '09:00', '17:45', 525, 465, 0, null],
        ['2026-11-09', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-10', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-12', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-13', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-18', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-19', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-23', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-24', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-25', '09:00', '18:00', 540, 480, 0, null],
        ['2026-11-26', '09:00', '18:00', 540, 480, 0, 'Seeded attendance'],
      ] as const;
      for (const [
        date,
        clockInTime,
        clockOutTime,
        durationMinutes,
        hoursWorkedMinutes,
        overtimeMinutes,
        remark,
      ] of demoAttendanceRows) {
        const clockInKey = `seed:E00001:${date}:IN`;
        const clockOutKey = `seed:E00001:${date}:OUT`;
        const clockIn = new Date(`${date}T${clockInTime}:00+08:00`);
        const clockOut = new Date(`${date}T${clockOutTime}:00+08:00`);
        await tx.attendanceSession.upsert({
          where: {
            companyId_employeeId_clockInKey: {
              companyId: company.id,
              employeeId: demoEmployee.id,
              clockInKey,
            },
          },
          create: {
            companyId: company.id,
            employeeId: demoEmployee.id,
            date: day(date),
            clockIn,
            clockOut,
            durationMinutes,
            hoursWorkedMinutes,
            overtimeMinutes,
            remark,
            clockInKey,
            clockOutKey,
          },
          update: {
            date: day(date),
            clockIn,
            clockOut,
            durationMinutes,
            hoursWorkedMinutes,
            overtimeMinutes,
            remark,
            clockOutKey,
          },
        });
      }

      const annualLeavePolicy = await tx.leavePolicy.findUnique({
        where: {
          companyId_code: { companyId: company.id, code: 'AL' },
        },
      });
      if (!annualLeavePolicy) throw new Error('Missing AL leave policy.');
      const existingDemoLeave = await tx.leaveRequest.findFirst({
        where: {
          companyId: company.id,
          employeeId: demoEmployee.id,
          reference: 'LV-DEMO-0001',
        },
      });
      const demoLeave =
        existingDemoLeave ??
        (await tx.leaveRequest.create({
          data: {
            companyId: company.id,
            employeeId: demoEmployee.id,
            policyId: annualLeavePolicy.id,
            reference: 'LV-DEMO-0001',
            requestDate: day('2026-11-05'),
            startDate: day('2026-11-16'),
            endDate: day('2026-11-17'),
            halfDay: false,
            days: new Prisma.Decimal('2.00'),
            reason: 'Family appointment.',
            status: 'APPROVED',
            managerId: demoManagerId,
            approval: 'MANAGER_HR',
            paid: true,
            decisionComment: 'Approved for demo data.',
            decidedBy: seedOwnerUserId,
            decidedAt: new Date('2026-11-06T10:00:00+08:00'),
          },
        }));
      if (
        !(await tx.leaveEvent.findFirst({ where: { requestId: demoLeave.id } }))
      ) {
        await tx.leaveEvent.create({
          data: {
            companyId: company.id,
            requestId: demoLeave.id,
            actorId: seedOwnerUserId,
            action: 'LEAVE_APPROVE',
            status: 'APPROVED',
            comment: 'Approved for demo data.',
          },
        });
      }

      const accrualStart = day('2026-01-01');
      const accrualEnd = day('2026-12-31');
      const [accrualPolicies, accrualEmployees] = await Promise.all([
        tx.leavePolicy.findMany({
          where: {
            companyId: company.id,
            active: true,
            effectiveFrom: { lte: accrualEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: accrualStart } }],
          },
        }),
        tx.employee.findMany({
          where: {
            companyId: company.id,
            joinedDate: { lte: accrualEnd },
            OR: [
              { resignationDate: null },
              { resignationDate: { gte: accrualStart } },
            ],
          },
          select: {
            id: true,
            joinedDate: true,
            resignationDate: true,
            employmentType: true,
            employmentStatus: true,
            active: true,
          },
        }),
      ]);
      for (const employee of accrualEmployees) {
        for (const policy of accrualPolicies) {
          const amount = accrualDays(policy, employee, 2026);
          if (amount.isZero()) continue;
          const idempotencyKey = `seed:accrual:2026:${employee.id}:${policy.id}`;
          await tx.leaveLedger.upsert({
            where: {
              companyId_idempotencyKey: {
                companyId: company.id,
                idempotencyKey,
              },
            },
            create: {
              companyId: company.id,
              employeeId: employee.id,
              policyId: policy.id,
              year: 2026,
              days: amount,
              kind: 'ACCRUAL',
              reason: `Seeded ${policy.code} entitlement for 2026.`,
              idempotencyKey,
            },
            update: {},
          });
        }
      }
      await tx.leaveLedger.upsert({
        where: {
          companyId_idempotencyKey: {
            companyId: company.id,
            idempotencyKey: `seed:usage:${demoLeave.id}`,
          },
        },
        create: {
          companyId: company.id,
          employeeId: demoEmployee.id,
          policyId: annualLeavePolicy.id,
          requestId: demoLeave.id,
          year: 2026,
          days: new Prisma.Decimal('-2.00'),
          kind: 'USAGE',
          reason: 'Seeded approved leave usage.',
          idempotencyKey: `seed:usage:${demoLeave.id}`,
        },
        update: {},
      });

      const existingDemoOvertime = await tx.overtimeRequest.findFirst({
        where: {
          companyId: company.id,
          employeeId: demoEmployee.id,
          overtimeDate: day('2026-11-04'),
          description: 'Deployment support.',
        },
      });
      if (!existingDemoOvertime) {
        await tx.overtimeRequest.create({
          data: {
            companyId: company.id,
            employeeId: demoEmployee.id,
            departmentId: demoDepartmentId,
            requestDate: day('2026-11-04'),
            overtimeDate: day('2026-11-04'),
            overtimeType: 'NORMAL_WORKING_DAY',
            startTime: '18:00',
            endTime: '18:30',
            totalMinutes: 30,
            breakDurationMinutes: 0,
            netMinutes: 30,
            hourlyRateMultiplier: new Prisma.Decimal('1.50'),
            earningCode: 'OT',
            description: 'Deployment support.',
            status: 'APPROVED',
            submittedAt: new Date('2026-11-04T18:35:00+08:00'),
            decisionComment: 'Approved for demo data.',
            decidedBy: seedOwnerUserId,
            decidedAt: new Date('2026-11-05T10:00:00+08:00'),
          },
        });
      }

      const travelClaimType = await tx.claimType.findUnique({
        where: { companyId_code: { companyId: company.id, code: 'TRV' } },
      });
      if (!travelClaimType) throw new Error('Missing TRV claim type.');
      const existingDemoClaim = await tx.claim.findFirst({
        where: {
          companyId: company.id,
          employeeId: demoEmployee.id,
          date: day('2026-11-18'),
          description: 'Travel expense for client meeting.',
        },
      });
      const demoClaim =
        existingDemoClaim ??
        (await tx.claim.create({
          data: {
            companyId: company.id,
            employeeId: demoEmployee.id,
            typeId: travelClaimType.id,
            date: day('2026-11-18'),
            amount: new Prisma.Decimal('86.50'),
            description: 'Travel expense for client meeting.',
            status: 'APPROVED',
            managerId: demoManagerId,
            paymentMethod: 'BANK_TRANSFER',
            paymentDate: day('2026-11-20'),
            paymentReference: 'DEMO-CLAIM-0001',
            decisionComment: 'Approved for demo data.',
            decidedBy: seedOwnerUserId,
            submittedAt: new Date('2026-11-18T18:00:00+08:00'),
          },
        }));
      if (
        !(await tx.claimEvent.findFirst({ where: { claimId: demoClaim.id } }))
      ) {
        await tx.claimEvent.create({
          data: {
            companyId: company.id,
            claimId: demoClaim.id,
            actorId: seedOwnerUserId,
            action: 'CLAIM_APPROVE',
            status: 'APPROVED',
            comment: 'Approved for demo data.',
          },
        });
      }

      const demoHolidayDate = day('2026-11-20');
      const demoHoliday = await tx.publicHoliday.findFirst({
        where: {
          companyId: company.id,
          name: 'Demo Company Day',
          startDate: demoHolidayDate,
          endDate: demoHolidayDate,
        },
      });
      if (!demoHoliday) {
        await tx.publicHoliday.create({
          data: {
            companyId: company.id,
            code: await nextPublicHolidayCode(tx, company.id),
            name: 'Demo Company Day',
            description: 'Seeded public holiday for calendar testing.',
            scope: 'NATIONAL',
            startDate: demoHolidayDate,
            endDate: demoHolidayDate,
            states: [],
            regions: [],
            status: 'ACTIVE',
            active: true,
          },
        });
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
