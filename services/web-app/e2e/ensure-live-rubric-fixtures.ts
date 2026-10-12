import { randomUUID } from 'node:crypto';
import type { E2EPrismaClient } from './prisma-client';
import dailyPagesEngagement from '../app/domain/rubrics/library/daily-pages-engagement.json' with {
  type: 'json',
};

/** Ensures library rubrics used by admin picker E2E tests are released (Live). */
export async function ensureE2eLiveRubricFixtures(prisma: E2EPrismaClient) {
  await ensureReleasedLibraryRubric(prisma, {
    name: 'daily-pages-engagement',
    title: 'Daily Pages engagement',
    schemaJson: dailyPagesEngagement,
  });
}

async function ensureReleasedLibraryRubric(
  prisma: E2EPrismaClient,
  input: { name: string; title: string; schemaJson: object }
) {
  let rubric = await prisma.rubric.findUnique({ where: { name: input.name } });
  if (!rubric) {
    rubric = await prisma.rubric.create({
      data: {
        name: input.name,
        title: input.title,
        schemaJson: input.schemaJson,
      },
    });
  }

  if (!rubric.currentRevisionId) {
    await prisma.rubric.update({
      where: { id: rubric.id },
      data: { schemaJson: rubric.schemaJson },
    });
    rubric = await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
  }

  const revisionId = rubric.currentRevisionId;
  if (!revisionId) {
    throw new Error(`E2E rubric ${input.name} has no current revision`);
  }

  await prisma.rubricRelease.upsert({
    where: { catalogKey: input.name },
    create: {
      catalogKey: input.name,
      rubricRevisionId: revisionId,
      releasedBy: 'e2e-seed@yawp.test',
      requestId: randomUUID(),
    },
    update: { rubricRevisionId: revisionId },
  });
}
