/**
 * Regenerates grading-prompt golden digests from the current compiler. Run on
 * main before changing prompt compilation, then commit the fixture.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseRubricSchema } from '../app/domain/rubrics/rubric-schema';
import { STARTER_RUBRICS } from '../app/domain/rubrics/starter-rubrics';
import { dailyPagesEngagementV1LibrarySchema } from '../app/domain/rubrics/library/daily-pages-engagement-v1.fixture';
import { compileRubricGradingPrompt } from '../app/domain/grading/compile-rubric-grading-prompt';
import catalog from '../app/domain/rubrics/__fixtures__/prod-rubric-catalog.json';

function digest(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const entries: Record<string, string> = {};

for (const schema of STARTER_RUBRICS) {
  entries[`starter:${schema.name}`] = digest(
    compileRubricGradingPrompt(schema).combined
  );
}

entries['seeded:daily-pages-engagement-v1'] = digest(
  compileRubricGradingPrompt(dailyPagesEngagementV1LibrarySchema).combined
);

const libraryDir = join(import.meta.dir, '../app/domain/rubrics/library');
for (const file of readdirSync(libraryDir).filter((name) => name.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(join(libraryDir, file), 'utf8')) as unknown;
  const parsed = parseRubricSchema(raw);
  if (!parsed.ok) throw new Error(`Library rubric ${file} failed parse: ${parsed.error}`);
  entries[`library:${file.replace(/\.json$/, '')}`] = digest(
    compileRubricGradingPrompt(parsed.schema).combined
  );
}

type CatalogFixture = {
  libraryRubrics: Array<{ name: string; schemaJson: unknown }>;
  perTypeRubrics: Array<{ id: string } & Record<string, unknown>>;
};

const catalogFixture = catalog as CatalogFixture;
const { perTypeContent } = await import('../app/domain/rubrics/rubric-catalog.server');

for (const rubric of catalogFixture.libraryRubrics) {
  const parsed = parseRubricSchema(rubric.schemaJson);
  if (!parsed.ok) throw new Error(`Catalog library ${rubric.name}: ${parsed.error}`);
  entries[`catalog:library:${rubric.name}`] = digest(
    compileRubricGradingPrompt(parsed.schema).combined
  );
}

for (const type of catalogFixture.perTypeRubrics) {
  const content = perTypeContent(type as never);
  const parsed = parseRubricSchema(content);
  if (!parsed.ok) {
    if (parsed.error.includes('at least one category')) continue;
    throw new Error(`Catalog per-type ${type.id}: ${parsed.error}`);
  }
  entries[`catalog:per-type:${type.id}`] = digest(
    compileRubricGradingPrompt(parsed.schema).combined
  );
}

const outPath = join(
  import.meta.dir,
  '../app/domain/grading/__fixtures__/grading-prompt-golden-main.json'
);
writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n');
console.log(`Wrote ${Object.keys(entries).length} entries to ${outPath}`);
