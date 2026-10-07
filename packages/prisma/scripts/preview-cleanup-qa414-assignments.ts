/* eslint-disable no-console */
/**
 * Removes reviewer-created qa414-* assignments from the preview free classroom org.
 *
 *   DATABASE_URL=... bun run packages/prisma/scripts/preview-cleanup-qa414-assignments.ts
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { PREVIEW_FREE_CLASSROOM_ORG_ID } from './local-dev/seed-preview-free-classroom';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, ssl: false }),
});

const deleted = await prisma.assignment.deleteMany({
  where: {
    title: { startsWith: 'qa414-' },
    classAssignments: {
      some: {
        class: { school: { organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID } },
      },
    },
  },
});

console.log(`Removed ${deleted.count} qa414-* assignment(s) from preview free org.`);
await prisma.$disconnect();
