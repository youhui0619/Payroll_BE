import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return 'scrypt$' + salt + '$' + key.toString('hex');
}
export async function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, key] = encoded.split('$');
  if (scheme !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(key ?? ''))
    return false;
  return timingSafeEqual(
    (await scrypt(password, salt, 64)) as Buffer,
    Buffer.from(key, 'hex'),
  );
}
