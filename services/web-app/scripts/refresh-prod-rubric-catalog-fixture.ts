/**
 * Refreshes prod-rubric-catalog.json library + per-type bodies from repo
 * sources and catalog metadata (prod-catalog export).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import cristoReyHornbuckle from '../app/domain/rubrics/library/cristo-rey-hornbuckle-five-paragraph-essay.json';
import dailyPagesEngagement from '../app/domain/rubrics/library/daily-pages-engagement.json';
import {
  parseAssignmentTypeRubricConfig,
  type AssignmentTypeRubricConfig,
} from '../app/domain/assignment-types/assignment-type-rubric-config';
import { PREWRITING_ASSIGNMENT_TYPE_KIND } from '../app/domain/assignment-types/prewriting-assignment-type';
import { THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND } from '../app/domain/assignment-types/thesis-statement-assignment-type';

const fixturePath = join(
  import.meta.dir,
  '../app/domain/rubrics/__fixtures__/prod-rubric-catalog.json'
);
const catalogMetaPath =
  process.env.PROD_CATALOG_META ??
  '/home/ubuntu/.cursor/projects/workspace/uploads/prod-catalog_43b1.json';

type Fixture = {
  libraryRubrics: Array<{ name: string; schemaJson: unknown; title: string }>;
  perTypeRubrics: Array<Record<string, unknown>>;
  source?: string;
};

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;

function configToPerTypeRow(
  id: string,
  title: string,
  config: AssignmentTypeRubricConfig
) {
  return {
    id,
    title,
    rubricJson: config.rubric,
    scoringScaleJson: config.scoringScale,
    gradingPromptConfigJson: config.promptConfig,
    gradingOutputSchemaJson: config.outputSchema,
    gradingCalibrationNotes: config.calibrationNotes,
  };
}

const libraryDaily = fixture.libraryRubrics.find(
  (rubric) => rubric.name === 'daily-pages-engagement'
);
if (libraryDaily) {
  libraryDaily.schemaJson = dailyPagesEngagement;
  libraryDaily.title = dailyPagesEngagement.title;
}

const hornbuckleInClass = configToPerTypeRow(
  'cmur0glku00d401l1cg6ou25q',
  'In-class Essay/Analysis (Cristo Rey)',
  parseAssignmentTypeRubricConfig({
    rubricJson: cristoReyHornbuckle.rubric,
    scoringScaleJson: cristoReyHornbuckle.scoringScale,
    gradingPromptConfigJson: cristoReyHornbuckle.promptConfig,
    gradingOutputSchemaJson: {
      ...cristoReyHornbuckle.outputSchema,
      scoringMode: 'holistic_tier',
      teacherNotesEnabled: true,
    },
    gradingCalibrationNotes: cristoReyHornbuckle.calibrationNotes,
    assignmentTypeKind: null,
  })
);

const prewriting = configToPerTypeRow(
  'cfreeprewriting000000001',
  'Prewriting',
  parseAssignmentTypeRubricConfig({
    assignmentTypeKind: PREWRITING_ASSIGNMENT_TYPE_KIND,
    rubricJson: { categories: [] },
  })
);

const thesisStatement = configToPerTypeRow(
  'cfreethesisstatement00001',
  'Thesis Statement',
  parseAssignmentTypeRubricConfig({
    assignmentTypeKind: THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND,
    rubricJson: { categories: [] },
  })
);

const prodQaWriting = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      '../../../packages/prisma/fixtures/prod-fidelity/assignment-types.json'
    ),
    'utf8'
  )
).find((row: { id: string }) => row.id === 'prod-qa-writing-assignment-type');

const prodQaV3 = {
  ...prodQaWriting,
  id: 'prod-qa-v3-writing-assignment-type',
  ownerOrgId: 'prod-qa-v3-org',
};

const existingIds = new Set(
  fixture.perTypeRubrics.map((row) => row.id as string)
);
const additions = [
  hornbuckleInClass,
  prewriting,
  thesisStatement,
  prodQaWriting,
  prodQaV3,
].filter((row) => !existingIds.has(row.id));

fixture.perTypeRubrics.push(...additions);

const meta = JSON.parse(readFileSync(catalogMetaPath, 'utf8')) as {
  generatedAt: string;
  totals: { libraryRubrics: number; perTypeRubrics: number };
};

fixture.source = `Read-only export of production rubric definitions, ${meta.generatedAt}. Rubric content synced from repo library + prod-fidelity; metadata from prod catalog API (${meta.totals.libraryRubrics} library, ${meta.totals.perTypeRubrics} per-type).`;

writeFileSync(fixturePath, JSON.stringify(fixture, null, 1) + '\n');
console.log(`Updated ${fixturePath} (+${additions.length} per-type rows)`);
