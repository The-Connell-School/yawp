/* eslint-disable no-console */
import { PrismaClient } from '@app/prisma';
import {
  createPassword,
  cleanupDb,
} from '../../../packages/prisma/scripts/utils';

let prisma: PrismaClient | null = null;

export type E2EContext = {
  organizationId: string;
  userId: string;
  userEmail: string;
  profileId: string;
  documentId: string;
};

export async function seedE2E(): Promise<E2EContext> {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  console.log('🌱 Seeding E2E DB...');
  await cleanupDb(prisma);

  // Minimal org
  const org = await prisma.organization.create({
    data: { id: 'the-connell-school', name: 'The Connell School' },
  });

  // Test users
  const users = [
    {
      email: 'jdoe@brock.software',
      name: 'John Doe',
      password: { create: createPassword('johndoe') },
      profiles: { create: [{ organizationId: org.id, isOwner: false }] },
    },
  ];

  for (const u of users) {
    await prisma.user.create({ data: u });
  }

  // Minimal content needed by app index and editor navigation
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'jdoe@brock.software' },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { userId: user.id },
  });
  const doc = await prisma.document.create({
    data: { profileId: profile.id, title: 'E2E Doc' },
  });
  console.log('✅ E2E seed complete. Document ID:', doc.id);
  return {
    organizationId: org.id,
    userId: user.id,
    userEmail: user.email,
    profileId: profile.id,
    documentId: doc.id,
  };
}

// Note: this module is imported by Playwright global-setup, not run directly.
