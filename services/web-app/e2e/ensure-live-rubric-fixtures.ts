import { createHash } from 'node:crypto';
import type { E2EPrismaClient } from './prisma-client';
import {
  CLASS_STARTER_THREE_BAND_RUBRIC_NAME,
  CLASS_STARTER_THREE_BAND_SCHEMA,
} from '../app/domain/assignment-types/class-starter-three-band-rubric';
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

/**
 * The three-band Class Starter rubric, as its migration adds it: a library
 * row whose current revision is version 1, so assignments created after an
 * admin selects it pin to it.
 */
export async function ensureE2eClassStarterThreeBandRubric(
  prisma: E2EPrismaClient
) {
  const existing = await prisma.rubric.findUnique({
    where: { name: CLASS_STARTER_THREE_BAND_RUBRIC_NAME },
    select: { id: true },
  });
  if (existing) return;
  const schemaJson = JSON.parse(JSON.stringify(CLASS_STARTER_THREE_BAND_SCHEMA));
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(schemaJson))
    .digest('hex');
  // Revisions are append-only and survive the seed's truncate, so the one
  // the migration recorded may already be here; reuse it as the migration does.
  const revision =
    (await prisma.rubricRevision.findFirst({
      where: { rubricName: CLASS_STARTER_THREE_BAND_RUBRIC_NAME },
      orderBy: { version: 'desc' },
      select: { id: true },
    })) ??
    (await prisma.rubricRevision.create({
    data: {
      id: `e2e-${CLASS_STARTER_THREE_BAND_RUBRIC_NAME}-v1`,
      rubricName: CLASS_STARTER_THREE_BAND_RUBRIC_NAME,
      version: 1,
      schemaJson,
      fingerprint,
      requestId: `e2e-${CLASS_STARTER_THREE_BAND_RUBRIC_NAME}-v1`,
      requestHash: fingerprint,
      createdBy: 'e2e-seed',
      reason: 'Class Starter on three bands',
    },
    select: { id: true },
  }));
  await prisma.rubric.create({
    data: {
      name: CLASS_STARTER_THREE_BAND_RUBRIC_NAME,
      title: CLASS_STARTER_THREE_BAND_SCHEMA.title,
      schemaJson,
      currentRevisionId: revision.id,
    },
  });
}
