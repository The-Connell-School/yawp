import type { E2EPrismaClient } from './prisma-client';
import dailyPagesEngagement from '../app/domain/rubrics/library/daily-pages-engagement.json' with {
  type: 'json',
};

/** Ensures library rubrics used by admin picker E2E tests exist in the database. */
export async function ensureE2eLiveRubricFixtures(prisma: E2EPrismaClient) {
  const existing = await prisma.rubric.findUnique({
    where: { name: 'daily-pages-engagement' },
    select: { id: true },
  });
  if (!existing) {
    await prisma.rubric.create({
      data: {
        name: 'daily-pages-engagement',
        title: 'Daily Pages engagement',
        schemaJson: dailyPagesEngagement,
      },
    });
  }
}
