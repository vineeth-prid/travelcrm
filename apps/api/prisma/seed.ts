import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Seeds the single administrator account. Idempotent: re-running only refreshes
 * the name, never the password of an existing account.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const name = process.env.ADMIN_NAME ?? 'Administrator';
  const email = process.env.ADMIN_EMAIL ?? 'admin@travelcrm.test';
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name },
      create: { name, email, password: await bcrypt.hash(password, 12) },
    });
    console.log(`Administrator ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
