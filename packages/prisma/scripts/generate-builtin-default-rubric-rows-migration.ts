/**
 * Generates SQL that inserts the three built-in default rubrics as library rows
 * when missing. Safe to run on environments that already have them.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { THESIS_DRIVEN_ESSAY } from '../../../services/web-app/app/domain/rubrics/thesis-driven-essay';
import {
  CLASS_STARTER_PROMPT_CONFIG,
  CLASS_STARTER_RUBRIC,
  CLASS_STARTER_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/class-starter-rubric';
import {
  DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/daily-pages-short-form-rubric';
import { DEFAULT_OUTPUT_SCHEMA_JSON } from '../../../services/web-app/app/domain/assignment-types/assignment-type-rubric.shared';

const CLASS_STARTER_RUBRIC_NAME = 'class-starter-engagement';
const DAILY_PAGES_SHORT_FORM_RUBRIC_NAME = 'daily-pages-short-form';

const rows = [
  THESIS_DRIVEN_ESSAY,
  {
    name: CLASS_STARTER_RUBRIC_NAME,
    title: 'Class Starter engagement',
    scoringScale: CLASS_STARTER_SCORING_SCALE,
    rubric: CLASS_STARTER_RUBRIC,
    promptConfig: CLASS_STARTER_PROMPT_CONFIG,
    outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
    calibrationNotes:
      'Soft, effort-based. Checks that the student wrote and reflected; honest effort earns full credit.',
  },
  {
    name: DAILY_PAGES_SHORT_FORM_RUBRIC_NAME,
    title: 'Daily Pages short-form writing',
    scoringScale: DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
    rubric: DAILY_PAGES_SHORT_FORM_RUBRIC,
    promptConfig: DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
    outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
    calibrationNotes:
      'A short piece graded like an essay: idea, support, structure, voice and grammar, on the essay 1-5 scale. Grammar and syntax are marked, unlike Class Starter. Effort alone earns the middle of the scale, and length is never rewarded or penalized on its own.',
  },
];

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

const statements = rows.map((schema) => {
  const json = JSON.stringify(schema);
  return `INSERT INTO "Rubric" ("id", "createdAt", "updatedAt", "name", "title", "schemaJson")
SELECT gen_random_uuid()::text, NOW(), NOW(), ${sqlLiteral(schema.name)}, ${sqlLiteral(schema.title)}, ${sqlLiteral(json)}::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "Rubric" WHERE "name" = ${sqlLiteral(schema.name)});`;
});

const migrationDir = path.resolve(
  import.meta.dir,
  '../migrations/20261012180000_builtin_default_rubric_library_rows'
);
const sql = `-- Inserts built-in default rubrics as library rows when missing. Never overwrites.
SET lock_timeout = '5s';

${statements.join('\n\n')}
`;

writeFileSync(path.join(migrationDir, 'migration.sql'), sql);
console.log(`Wrote ${path.join(migrationDir, 'migration.sql')}`);
