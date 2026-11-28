import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HolidayDto } from './workforce.dto';

describe('HolidayDto', () => {
  it('accepts FE public-holiday fields and normalizes scope casing', async () => {
    const dto = plainToInstance(HolidayDto, {
      name: 'Malaysia Day',
      description: '',
      scope: 'State',
      regions: [],
      startDate: '2026-09-16',
      endDate: '2026-09-16',
      active: true,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.description).toBeNull();
    expect(dto.scope).toBe('STATE');
    expect(dto.active).toBe(true);
  });

  it('uses the FE state values instead of MY-xx codes', async () => {
    const valid = plainToInstance(HolidayDto, {
      name: 'Johor Sultan Birthday',
      startDate: '2026-03-23',
      endDate: '2026-03-23',
      scope: 'STATE',
      regions: ['Johor'],
      states: ['JOHOR'],
      active: true,
    });
    const invalid = plainToInstance(HolidayDto, {
      name: 'Legacy State Code',
      startDate: '2026-03-23',
      endDate: '2026-03-23',
      scope: 'STATE',
      states: ['MY-01'],
      active: true,
    });

    expect(await validate(valid)).toHaveLength(0);
    expect(
      (await validate(invalid)).some((error) => error.property === 'states'),
    ).toBe(true);
  });
});
