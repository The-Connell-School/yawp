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
import { upsertRubric } from '../app/domain/rubrics/rubric-library.server';
import {
  RETIRED_STARTER_RUBRIC_NAMES,
  STARTER_RUBRICS,
} from '../app/domain/rubrics/starter-rubrics';

const force = process.argv.includes('--force');

if (force) {
  for (const schema of STARTER_RUBRICS) {
    const rubric = await upsertRubric(schema);
    console.log(`republished ${rubric.name}`);
  }
} else {
  const created: string[] = [];
  for (const schema of STARTER_RUBRICS) {
    if (RETIRED_STARTER_RUBRIC_NAMES.has(schema.name)) continue;
    const existing = await prisma.rubric.findUnique({
      where: { name: schema.name },
      select: { id: true, archivedAt: true },
    });
    if (existing) continue;
    await prisma.rubric.create({
      data: {
        name: schema.name,
        title: schema.title,
        schemaJson: schema as object,
      },
    });
    created.push(schema.name);
  }
  console.log(
    created.length ? `created ${created.join(', ')}` : 'nothing to create'
  );
}

await prisma.$disconnect();
