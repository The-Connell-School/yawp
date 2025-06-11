/* eslint-disable no-console */
import { PrismaClient, type Prisma } from '@prisma/client';
import { preview } from '../fixtures/preview';
import { cleanupDb } from './utils';

const prisma = new PrismaClient();

type SeedData = {
  users: Prisma.UserCreateInput[];
  featureFlags: Prisma.FeatureFlagCreateInput[];
  courses: Prisma.CourseCreateInput[];
  organizations: Prisma.OrganizationCreateInput[];
};

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

  for (const key of Object.keys(data) as Array<keyof SeedData>) {
    console.time(`Created ${key}`);
    await Promise.all(
      data[key].map((item) => {
        switch (key) {
          case 'users':
            return prisma.user.create({ data: item as Prisma.UserCreateInput });
          case 'featureFlags':
            return prisma.featureFlag.create({
              data: item as Prisma.FeatureFlagCreateInput,
            });
          case 'courses':
            return prisma.course.create({
              data: item as Prisma.CourseCreateInput,
            });
          case 'organizations':
            return prisma.organization.create({
              data: item as Prisma.OrganizationCreateInput,
            });
          default:
            throw new Error(`Unknown model: ${key}`);
        }
      })
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
