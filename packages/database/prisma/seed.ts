import 'dotenv/config';

import bcrypt from 'bcryptjs';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function main() {
  const name = process.env.SEED_ADMIN_NAME ?? 'Max';
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@ravoxzap.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ravoxzap123';
  const organizationName = process.env.SEED_ORGANIZATION_NAME ?? 'Ravox Labs';
  const organizationSlug = slugify(organizationName) || 'ravox-labs';

  const passwordHash = await bcrypt.hash(password, 12);

  const organization = await prisma.organization.upsert({
    where: { slug: organizationSlug },
    update: { name: organizationName },
    create: {
      name: organizationName,
      slug: organizationSlug,
    },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
    },
    create: {
      name,
      email,
      passwordHash,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: organization.id,
      },
    },
    update: { role: 'OWNER' },
    create: {
      userId: user.id,
      organizationId: organization.id,
      role: 'OWNER',
    },
  });

  console.log('Seed completed');
  console.log(`Admin: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Organization: ${organization.name}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
