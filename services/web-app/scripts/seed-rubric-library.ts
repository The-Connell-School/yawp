/**
 * Puts the starter rubrics in the library for whichever database DATABASE_URL
 * points at.
 *
 * Default is additive: a rubric already stored under the same name is left
 * alone, so running this against an environment never overwrites a rubric
 * someone pasted there. `--force` republishes the starters over what is stored,
 * which is how a corrected starter reaches an environment that already has the
 * old one.
 *
 *   bun scripts/seed-rubric-library.ts
 *   bun scripts/seed-rubric-library.ts --force
 */
import { prisma } from '../app/utils/db.server';
import {
  seedStarterRubrics,
  upsertRubric,
} from '../app/domain/rubrics/rubric-library.server';
import { STARTER_RUBRICS } from '../app/domain/rubrics/starter-rubrics';

const force = process.argv.includes('--force');

if (force) {
  for (const schema of STARTER_RUBRICS) {
    const rubric = await upsertRubric(schema);
    console.log(`republished ${rubric.name}`);
  }
} else {
  const created = await seedStarterRubrics();
  console.log(
    created.length ? `created ${created.join(', ')}` : 'nothing to create'
  );
}

await prisma.$disconnect();
