/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { preview } from '../fixtures/preview';
import { cleanupDb } from './utils';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding...');
  console.time(`🌱 Database has been seeded`);

  console.time('🧹 Cleaned up the database...');
  try {
    await cleanupDb(prisma);
  } catch (e) {
    console.error(e);
  }
  const data = await preview(prisma);
  console.timeEnd('🧹 Cleaned up the database...');

  for (const key of Object.keys(data)) {
    console.time(`Created ${key}`);
    await Promise.all(
      // @ts-expect-error - being fancy here
      data[key].map((item) => prisma[key].create({ data: item }))
    );
    console.timeEnd(`Created ${key}`);
  }

  console.timeEnd(`🌱 Database has been seeded`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
