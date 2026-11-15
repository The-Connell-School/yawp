import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setFeatureFlag } from './feature-flags';
import { createE2EPrismaClient } from './prisma-client';

/**
 * Smoke shards share one Postgres database across parallel CI jobs. Reset
 * cross-spec pollution before each shard's run starts.
 */
export default async function globalSetup() {
  await setFeatureFlag('assignments-grouped-by-type', false);

  const e2eDir = path.dirname(fileURLToPath(import.meta.url));
  const ctxPath = path.join(e2eDir, '.e2e-context.json');
  if (!fs.existsSync(ctxPath)) return;

  const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')) as {
    assignmentTypeId?: string;
  };
  if (!ctx.assignmentTypeId) return;

  const prisma = createE2EPrismaClient();
  try {
    await prisma.assignmentType.update({
      where: { id: ctx.assignmentTypeId },
      data: { archivedAt: null },
    });
  } finally {
    await prisma.$disconnect();
  }
}