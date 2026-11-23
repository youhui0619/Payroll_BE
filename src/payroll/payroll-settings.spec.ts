import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PayrollSettingsDto } from './payroll.dto';

const base = {
  currency: 'MYR',
  payrollCutoffDay: 'LAST_DAY',
  scheduledPayDate: 1,
};
describe('FE payroll settings validation', () => {
  it.each([1, 15, 31, 'LAST_DAY'])(
    'accepts day %s without requiring the backend-only makerChecker field',
    (day) => {
      expect(
        validateSync(
          plainToInstance(PayrollSettingsDto, {
            ...base,
            payrollCutoffDay: day,
            scheduledPayDate: day,
          }),
        ),
      ).toEqual([]);
    },
  );
  it.each([0, 32, -1, 1.5, '15', 'BAD', {}, [], true])(
    'rejects invalid cutoff and pay date %j',
    (day) => {
      for (const field of ['payrollCutoffDay', 'scheduledPayDate']) {
        expect(
          validateSync(
            plainToInstance(PayrollSettingsDto, { ...base, [field]: day }),
          ).map((error) => error.property),
        ).toContain(field);
      }
    },
  );
  it('accepts the FE empty overtime configuration', () => {
    expect(
      validateSync(
        plainToInstance(PayrollSettingsDto, {
          ...base,
          standardWorkingHoursPerDay: null,
          normalWorkingDayMultiplier: null,
          restDayOvertimeMultiplier: null,
          publicHolidayOvertimeMultiplier: null,
          normalWorkingDayEarningCode: '',
          restDayEarningCode: '',
          publicHolidayEarningCode: '',
        }),
      ),
    ).toEqual([]);
  });
  it.each([
    { makerChecker: null },
    { standardWorkingHoursPerDay: 25 },
    { standardWorkingHoursPerDay: 0 },
    { normalWorkingDayMultiplier: -1 },
    { restDayOvertimeMultiplier: 1000 },
    { publicHolidayOvertimeMultiplier: 1.001 },
    { normalWorkingDayEarningCode: ' ' },
    { restDayEarningCode: 'invalid code' },
  ])('rejects invalid configuration %j', (change) => {
    expect(
      validateSync(plainToInstance(PayrollSettingsDto, { ...base, ...change }))
        .length,
    ).toBeGreaterThan(0);
  });
});
