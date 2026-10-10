/**
 * Regenerates grading-prompt golden digests from the current compiler. Run on
 * main before changing prompt compilation, then commit the fixture.
 *
 * Every digest in grading-prompt-golden-main.json must come from main. For
 * assembly:* keys, run compileGradingAssistantInvocation on main without
 * assignment grammar overrides (same as grade-essay-ai when display.grammarHighlight
 * is unset).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseRubricSchema } from '../app/domain/rubrics/rubric-schema';
import { STARTER_RUBRICS } from '../app/domain/rubrics/starter-rubrics';
import { dailyPagesEngagementV1LibrarySchema } from '../app/domain/rubrics/library/daily-pages-engagement-v1.fixture';
import { compileRubricGradingPrompt } from '../app/domain/grading/compile-rubric-grading-prompt';
import { compileGradingAssistantInvocation } from '../app/domain/grading/grading-assistant-invocation';
import {
  getThesisDefaultRubricConfig,
  parseAssignmentTypeRubricConfig,
} from '../app/domain/assignment-types/assignment-type-rubric-config';
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
  let parsed = parseRubricSchema(content);
  if (!parsed.ok && parsed.error.includes('at least one category')) {
    const builtIn = parseAssignmentTypeRubricConfig({
      rubricJson: (type as { rubricJson?: unknown }).rubricJson,
      scoringScaleJson: (type as { scoringScaleJson?: unknown }).scoringScaleJson,
      gradingPromptConfigJson: (type as { gradingPromptConfigJson?: unknown })
        .gradingPromptConfigJson,
      gradingOutputSchemaJson: (type as { gradingOutputSchemaJson?: unknown })
        .gradingOutputSchemaJson,
      gradingCalibrationNotes: (type as { gradingCalibrationNotes?: string | null })
        .gradingCalibrationNotes,
      assignmentTypeKind: null,
    });
    parsed = parseRubricSchema({
      name: `assignment-type:${type.id}`,
      title: (type as { title?: string | null }).title ?? type.id,
      scoringScale: builtIn.scoringScale,
      rubric: builtIn.rubric,
      promptConfig: builtIn.promptConfig,
      outputSchema: builtIn.outputSchema,
      calibrationNotes: builtIn.calibrationNotes,
    });
  }
  if (!parsed.ok) {
    throw new Error(`Catalog per-type ${type.id}: ${parsed.error}`);
  }
  entries[`catalog:per-type:${type.id}`] = digest(
    compileRubricGradingPrompt(parsed.schema).combined
  );
}

const thesis = getThesisDefaultRubricConfig();
const thesisInvocation = compileGradingAssistantInvocation({
  gradingConfig: {
    label: thesis.defaultLabel ?? 'Thesis-driven essay grading assistant',
    minScore: thesis.scoringScale.minScore,
    maxScore: thesis.scoringScale.maxScore,
    rubricCategories: thesis.rubric.categories,
    instructions: {
      mode: 'preset',
      rubricInstructions: 'rubric',
      scoreInstructions: 'score',
    },
    outputSchemaSnapshot: thesis.outputSchema,
  },
  studentFirstName: 'Jordan',
  strictnessLevel: 'intermediate',
  documentText: 'Essay body for golden digest.',
});
entries['assembly:thesis-default-grammar-off'] = digest(
  `${thesisInvocation.system}\n---\n${thesisInvocation.userMessage}`
);

const managedInvocation = compileGradingAssistantInvocation({
  gradingConfig: {
    label: 'Managed template rubric',
    minScore: 1,
    maxScore: 5,
    rubricCategories: thesis.rubric.categories,
    instructions: {
      mode: 'unified',
      gradingInstructions: 'Grade with care.',
    },
    outputSchemaSnapshot: { teacherNotesEnabled: true },
    promptTemplate: {
      systemMessage: 'Managed grading system.',
      userMessage: '{{rubric}}\n{{grading_instructions}}\n{{document}}',
    },
  },
  studentFirstName: 'Jordan',
  strictnessLevel: 'intermediate',
  documentText: 'Essay body for golden digest.',
});
entries['assembly:managed-template'] = digest(
  `${managedInvocation.system}\n---\n${managedInvocation.userMessage}`
);

const outPath = join(
  import.meta.dir,
  '../app/domain/grading/__fixtures__/grading-prompt-golden-main.json'
);
const fixtureBody = {
  _comment:
    'Every digest must be generated from a checkout of main (see generate-grading-prompt-golden.ts). Assembly keys use main compileGradingAssistantInvocation without assignment grammar overrides.',
  ...entries,
};
writeFileSync(outPath, JSON.stringify(fixtureBody, null, 2) + '\n');
console.log(`Wrote ${Object.keys(entries).length} entries to ${outPath}`);
