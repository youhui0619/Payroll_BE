import { hashPassword, verifyPassword } from './password';
describe('passwords', () => {
  it('hashes with a unique salt and verifies without accepting another password', async () => {
    const first = await hashPassword('correct horse battery');
    expect(first).not.toEqual(await hashPassword('correct horse battery'));
    expect(await verifyPassword('correct horse battery', first)).toBe(true);
    expect(await verifyPassword('wrong', first)).toBe(false);
    expect(await verifyPassword('wrong', 'invalid')).toBe(false);
  });
});
