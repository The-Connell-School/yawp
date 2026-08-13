/**
 * Prints the exact payload the Grading Assistant sends for an assignment type.
 *
 * The rubric-evaluation call is the one that decides scores, so this resolves
 * the same config that route does and assembles the same two strings, rather
 * than describing them. Read-only: it opens the database, reads assignment
 * types, and writes nothing.
 *
 *   bun scripts/dump-grading-prompt.ts --list
 *   bun scripts/dump-grading-prompt.ts --assignment-type <id>
 *   bun scripts/dump-grading-prompt.ts --assignment-type <id> --json
 *
 * Point DATABASE_URL at whichever environment you want the truth from.
 */
import { prisma } from '../app/utils/db.server';
import { resolveAssignmentTypeGradingConfig } from '../app/domain/assignment-types/assignment-type-grading-config.server';
import { buildGradingPromptShape } from '../app/domain/grading/grading-prompt-shape';
import { buildGradingRequest } from '../app/domain/grading/grading-request';

const ESSAY_PLACEHOLDER = '<<< THE STUDENT SUBMISSION TEXT GOES HERE >>>';
const ASSIGNMENT_PROMPT_PLACEHOLDER = null;
const STUDENT_FIRST_NAME = 'Jordan';

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function listAssignmentTypes() {
  const rows = await prisma.assignmentType.findMany({
    select: {
      id: true,
      title: true,
      kind: true,
      rubricJson: true,
      rubricId: true,
      ownerOrg: { select: { name: true } },
    },
    orderBy: { title: 'asc' },
  });

  for (const row of rows) {
    const ownRubric =
      row.rubricJson && typeof row.rubricJson === 'object' ? 'own' : 'none';
    console.log(
      [
        row.id,
        JSON.stringify(row.title),
        `kind=${row.kind ?? 'null'}`,
        `rubricJson=${ownRubric}`,
        `library=${row.rubricId ?? 'none'}`,
        `org=${row.ownerOrg?.name ?? 'none'}`,
      ].join('  ')
    );
  }
}

async function dump(assignmentTypeId: string, asJson: boolean) {
  const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId });
  const promptShape = buildGradingPromptShape({
    categories: config.rubricCategories,
    minScore: config.minScore,
    maxScore: config.maxScore,
    studentFirstName: STUDENT_FIRST_NAME,
  });
  const request = buildGradingRequest({
    promptShape,
    instructions: config.instructions,
    label: config.label,
    studentFirstName: STUDENT_FIRST_NAME,
    assignmentPrompt: ASSIGNMENT_PROMPT_PLACEHOLDER,
    essayText: ESSAY_PLACEHOLDER,
  });

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          resolvedFrom: config.source,
          label: config.label,
          scoringScale: {
            type: config.scoringType,
            minScore: config.minScore,
            maxScore: config.maxScore,
            step: config.step,
          },
          instructionsMode: config.instructions.mode,
          categoryFeedbackEnabled: promptShape.categoryFeedbackEnabled,
          request,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`# Assignment type: ${assignmentTypeId}`);
  console.log(`# Rubric resolved from: ${config.source}`);
  console.log(`# Label: ${config.label}`);
  console.log(
    `# Scale: ${config.scoringType} ${config.minScore}-${config.maxScore} step ${config.step}`
  );
  console.log(`# Instructions mode: ${config.instructions.mode}`);
  console.log(
    `# Per-category feedback: ${promptShape.categoryFeedbackEnabled}`
  );
  console.log('\n===== SYSTEM =====\n');
  console.log(request.system);
  console.log('\n===== USER =====\n');
  console.log(request.userPrompt);
}

const assignmentTypeId = argValue('--assignment-type');

if (process.argv.includes('--list') || !assignmentTypeId) {
  await listAssignmentTypes();
} else {
  await dump(assignmentTypeId, process.argv.includes('--json'));
}

await prisma.$disconnect();
