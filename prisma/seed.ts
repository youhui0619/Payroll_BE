import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

async function seed() {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  const companyName = process.env.SEED_COMPANY_NAME;
  if (!email || !password || password.length < 8 || !companyName) {
    throw new Error('Set SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD (8+ characters), and SEED_COMPANY_NAME.');
  }
  const db = new PrismaClient();
  try {
    if (await db.user.findUnique({ where: { email } })) throw new Error('Owner already exists; seed will not overwrite accounts.');
    const passwordHash = await hashPassword(password);
    await db.$transaction(async tx => {
      const company = await tx.company.create({ data: { name: companyName } });
      const user = await tx.user.create({ data: { email, passwordHash } });
      await tx.membership.create({ data: { companyId: company.id, userId: user.id, roles: ['OWNER'] } });
    });
  } finally { await db.$disconnect(); }
}
void seed().catch(() => { console.error('Seed failed. Check configuration and whether the owner already exists.'); process.exitCode = 1; });
