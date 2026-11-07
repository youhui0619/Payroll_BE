import { validationDetails } from './http-setup';
describe('field errors', () => {
  it('preserves nested field paths without reflecting submitted values', () => {
    expect(
      validationDetails([
        {
          property: 'personal',
          children: [
            {
              property: 'email',
              value: 'secret',
              constraints: { isEmail: 'Invalid email' },
            },
          ],
        },
      ]),
    ).toEqual([
      { field: 'personal.email', code: 'isEmail', message: 'Invalid email' },
    ]);
  });
});
