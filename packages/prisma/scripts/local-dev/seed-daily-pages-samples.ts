// Types come from the generated client; the one runtime value this file needs
// comes from the package's own ESM wrapper instead.
//
// This module is reachable from a web route — the admin organizations page
// pulls in `preview-seats.ts`, which pulls in `seed-synthetic-data.ts`, which
// pulls in this file — and in Vite's SSR graph `../../generated/prisma`
// resolves to the client's *browser* build, whose first line of CommonJS
// throws `exports is not defined`. `../../index` is the wrapper that
// `createRequire`s the Node build on purpose, which is how `db.server.ts`
// loads the client in the same environment.
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { Prisma as PrismaRuntime } from '../../index';
import {
  DAILY_PAGES_SAMPLE_ASSIGNMENT,
  DAILY_PAGES_SAMPLE_ENTRIES,
  buildSampleGrammarIssues,
  buildSampleRubricScores,
  sampleGradeFields,
  type DailyPagesSampleEntry,
  type DailyPagesSamplePersonaKey,
} from '../../../../services/web-app/app/domain/assignment-types/daily-pages-sample-entries.ts';
import {
  DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT,
  DAILY_PAGES_ANALYZE_SAMPLE_DRAFT,
  DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES,
} from '../../../../services/web-app/app/domain/assignment-types/daily-pages-analyze-sample-entries.ts';
import {
  DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
  DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS,
  DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS,
  DAILY_PAGES_SHORT_FORM_WELCOME,
} from '../../../../services/web-app/app/domain/assignment-types/daily-pages-short-form-rubric.ts';

/**
 * Graded Daily Pages work for seeded environments.
 *
 * A preview that has only the about page can say what the new assistant does;
 * it cannot show it. These four entries answer one prompt across the scale, so
 * opening the assignment shows a real class set: two released, one weaker one
 * released, and one graded but not yet released.
 */

type SeedClient = PrismaClient | Prisma.TransactionClient;

export type DailyPagesSampleSeedOptions = {
  assignmentTypeId: string;
  classId: string;
  /** Recorded as the grader, the way a teacher-run grading pass records it. */
  teacherMembershipId: string;
  studentMembershipIds: Record<DailyPagesSamplePersonaKey, string>;
};

export type DailyPagesSampleSeedResult = {
  assignmentId: string;
  submissionIds: string[];
  /** True when the entries were already there and nothing was created. */
  alreadySeeded: boolean;
};

/** `<p>` per paragraph, which is what the editor stores for plain prose. */
export function sampleEntryHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.trim()}</p>`)
    .join('');
}

/**
 * The rubric a grading run records alongside the scores.
 *
 * Seeded submissions carry one because the display reads the run's snapshot
 * before it reads the assignment type — so the four entries keep rendering
 * against the rubric they were scored on even if the type is reconfigured
 * later in the preview.
 */
export function sampleRubricSnapshot(): Prisma.InputJsonValue {
  return {
    categories: DAILY_PAGES_SHORT_FORM_RUBRIC.categories,
    minScore: DAILY_PAGES_SHORT_FORM_SCORING_SCALE.minScore,
    maxScore: DAILY_PAGES_SHORT_FORM_SCORING_SCALE.maxScore,
    step: DAILY_PAGES_SHORT_FORM_SCORING_SCALE.step,
    scoringType: DAILY_PAGES_SHORT_FORM_SCORING_SCALE.type,
  } as unknown as Prisma.InputJsonValue;
}

/** The grade fields, AI metadata and feedback one entry is stored with. */
export function sampleSubmissionGradeData(
  entry: DailyPagesSampleEntry,
  options: { teacherMembershipId: string; assignmentTypeId: string }
) {
  const grade = sampleGradeFields(entry);
  const submittedAt = new Date(
    Date.now() - entry.submittedDaysAgo * 24 * 60 * 60 * 1000
  );
  const gradedAt = new Date(submittedAt.getTime() + 20 * 60 * 1000);

  return {
    submittedAt,
    gradedAt,
    gradedByMembershipId: options.teacherMembershipId,
    rubricScores: buildSampleRubricScores(entry) as Prisma.InputJsonValue,
    overallScore: grade.overallScore,
    numericPercentage: grade.numericPercentage,
    letterGrade: grade.letterGrade,
    score: grade.score,
    overallComment: entry.overallComment,
    grammarIssues: buildSampleGrammarIssues(entry) as Prisma.InputJsonValue,
    aiMeta: {
      model: 'seeded-sample',
      gradedAt: gradedAt.toISOString(),
      gradingConfigSource: 'daily-pages-short-form-default',
      assignmentTypeRubricSource: 'daily-pages-short-form-default',
      assignmentTypeId: options.assignmentTypeId,
      rubricCategoryKeys: DAILY_PAGES_SHORT_FORM_RUBRIC.categories.map(
        (category) => category.key
      ),
      seeded: true,
    } as unknown as Prisma.InputJsonValue,
    releasedAt: entry.released ? gradedAt : null,
  };
}

/**
 * Point the seeded Daily Pages type at the new short-form assistant.
 *
 * The production row this fixture copies saved its own 0-30 engagement rubric,
 * and a saved rubric always wins — so without this a preview grades Daily
 * Pages exactly as it did before the split, which is the one thing a preview
 * of the split must not do. Clearing the saved rubric here falls the type back
 * to the built-in default for its kind. Seeded environments only; production's
 * row is deliberately left alone.
 */
export async function adoptShortFormRubricForSeededDailyPages(
  prisma: SeedClient,
  assignmentTypeId: string
) {
  await prisma.assignmentType.update({
    where: { id: assignmentTypeId },
    data: {
      rubricJson: PrismaRuntime.DbNull,
      scoringScaleJson: PrismaRuntime.DbNull,
      gradingPromptConfigJson: PrismaRuntime.DbNull,
    },
  });
}

/**
 * Point the seeded Daily Pages module's Tutor at paragraph-practice coaching.
 *
 * The tutor's instructions are module content, and the row that ships today is
 * the freewrite tutor: "help them think through an idea by asking them probing
 * questions" — which coaches the exploration this assignment type no longer
 * wants. Its `rubricAlignmentJson` is also unset, so none of the rubric's own
 * language reaches the tutor either; setting it is what sends the category
 * descriptions (including the first-person rule) into the tutor prompt.
 *
 * Seeded environments only, for the same reason the rubric reset is: changing
 * it for a customer is a deliberate content change.
 */
export async function adoptShortFormTutorForSeededDailyPages(
  prisma: SeedClient,
  assignmentTypeId: string
) {
  await prisma.assignmentModule.updateMany({
    where: { assignmentTypeId, deletedAt: null },
    data: {
      tutorInstructions: DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS,
      description:
        'Respond to the prompt in one short academic paragraph: make your point clearly, then hold it up.',
      rubricAlignmentJson: {
        depth_of_thought: 'primary',
        development_of_thought: 'primary',
        organization_and_structure: 'supporting',
        voice_and_style: 'supporting',
        grammar_and_mechanics: 'supporting',
      } as unknown as Prisma.InputJsonValue,
    },
  });

  // The step is joined after the module text, and the one that shipped is the
  // freewrite tutor: left in place, the tutor is told both to coach one
  // deliberate move and to encourage exploring. Its welcome tells students
  // they may not need feedback at all.
  await prisma.assignmentModuleInstruction.updateMany({
    where: { assignmentModule: { assignmentTypeId, deletedAt: null } },
    data: {
      tutorInstructions: DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS,
      prompt: DAILY_PAGES_SHORT_FORM_WELCOME,
    },
  });

  // Each document stores the welcome as its first tutor message when it is
  // created, so documents already seeded would keep the old one. Only that
  // exact opening message is rewritten; nothing anyone said is touched.
  await prisma.assignmentModuleSessionMessage.updateMany({
    where: {
      agent: 'assistant',
      content: { contains: OLD_DAILY_PAGES_WELCOME_SENTENCE },
      assignmentModuleSession: { assignmentModule: { assignmentTypeId } },
    },
    data: { content: DAILY_PAGES_SHORT_FORM_WELCOME },
  });
}

/** The sentence that identifies the freewrite-era welcome message. */
const OLD_DAILY_PAGES_WELCOME_SENTENCE =
  'You may not need or want feedback for this type of writing';

/**
 * One session per module in the type, opened on its first instruction.
 *
 * Every document needs one, or opening it hits "No assignment module session
 * found." — and a draft needs one for the tutor to run at all.
 */
async function sampleModuleSessions(prisma: SeedClient, assignmentTypeId: string) {
  const modules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      instructions: {
        orderBy: { position: 'asc' },
        select: { id: true, prompt: true },
      },
    },
  });

  return modules.map((assignmentModule) => {
    const firstInstruction = assignmentModule.instructions[0];
    return {
      instructionsCompleted: 0,
      assignmentModuleId: assignmentModule.id,
      ...(firstInstruction
        ? {
            messages: {
              create: [
                {
                  content: firstInstruction.prompt,
                  agent: 'assistant',
                  instructionId: firstInstruction.id,
                },
              ],
            },
          }
        : {}),
    };
  });
}

export async function seedDailyPagesSampleEntries(
  prisma: SeedClient,
  options: DailyPagesSampleSeedOptions
): Promise<DailyPagesSampleSeedResult> {
  await adoptShortFormRubricForSeededDailyPages(
    prisma,
    options.assignmentTypeId
  );
  await adoptShortFormTutorForSeededDailyPages(
    prisma,
    options.assignmentTypeId
  );

  const moduleSessions = await sampleModuleSessions(
    prisma,
    options.assignmentTypeId
  );

  // Runs on every preview deploy, so it has to be safe to run twice: the
  // rubric above is reset each time, the class set is created once.
  const existing = await prisma.assignment.findFirst({
    where: {
      assignmentTypeId: options.assignmentTypeId,
      title: DAILY_PAGES_SAMPLE_ASSIGNMENT.title,
    },
    select: { id: true },
  });
  if (existing) {
    return {
      assignmentId: existing.id,
      submissionIds: [],
      alreadySeeded: true,
    };
  }

  const assignment = await prisma.assignment.create({
    data: {
      assignmentTypeId: options.assignmentTypeId,
      title: DAILY_PAGES_SAMPLE_ASSIGNMENT.title,
      prompt: DAILY_PAGES_SAMPLE_ASSIGNMENT.prompt,
      submitForGrade: true,
      pointValue: 100,
    },
  });
  const classAssignment = await prisma.classAssignment.create({
    data: { assignmentId: assignment.id, classId: options.classId },
  });

  const submissionIds: string[] = [];
  for (const entry of DAILY_PAGES_SAMPLE_ENTRIES) {
    const membershipId = options.studentMembershipIds[entry.personaKey];
    if (!membershipId) continue;

    const html = sampleEntryHtml(entry.text);
    const document = await prisma.document.create({
      data: {
        title: entry.title,
        text: entry.text,
        html,
        revision: 2,
        membershipId,
        assignmentTypeId: options.assignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
        ...(moduleSessions.length
          ? { assignmentModuleSessions: { create: moduleSessions } }
          : {}),
      },
    });

    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        title: entry.title,
        text: entry.text,
        html,
        ...sampleSubmissionGradeData(entry, {
          teacherMembershipId: options.teacherMembershipId,
          assignmentTypeId: options.assignmentTypeId,
        }),
      },
    });
    submissionIds.push(submission.id);

    await prisma.submissionGradingAssistantRun.create({
      data: {
        submissionId: submission.id,
        assignmentTypeId: options.assignmentTypeId,
        assignmentTypeGradingVersion: 1,
        assignmentTypeRubricSnapshot: sampleRubricSnapshot(),
        assignmentTypePromptConfigSnapshot:
          DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG as unknown as Prisma.InputJsonValue,
        source: 'daily-pages-short-form-default',
        model: 'seeded-sample',
        status: 'succeeded',
        metadata: { seeded: true } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return { assignmentId: assignment.id, submissionIds, alreadySeeded: false };
}

/**
 * An Analyze class set beside the first one: a Daily Pages assignment run as
 * an analysis paragraph (`paragraphMode: 'analyze'`, fifteen minutes, tutor
 * on), three graded entries — two released, one held back — and one draft
 * left unsubmitted, so the live Analyze tutor has something to coach.
 *
 * Runs after `seedDailyPagesSampleEntries`, which owns the type's rubric and
 * tutor; this only adds work. Safe to run on every deploy.
 */
export async function seedDailyPagesAnalyzeSamples(
  prisma: SeedClient,
  options: DailyPagesSampleSeedOptions
): Promise<DailyPagesSampleSeedResult> {
  const existing = await prisma.assignment.findFirst({
    where: {
      assignmentTypeId: options.assignmentTypeId,
      title: DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.title,
    },
    select: { id: true },
  });
  if (existing) {
    return {
      assignmentId: existing.id,
      submissionIds: [],
      alreadySeeded: true,
    };
  }

  const moduleSessions = await sampleModuleSessions(
    prisma,
    options.assignmentTypeId
  );
  const assignment = await prisma.assignment.create({
    data: {
      assignmentTypeId: options.assignmentTypeId,
      title: DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.title,
      prompt: DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.prompt,
      paragraphMode: DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.paragraphMode,
      writingTimeMinutes: DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.writingTimeMinutes,
      tutorEnabled: true,
      submitForGrade: true,
      pointValue: 100,
    },
  });
  const classAssignment = await prisma.classAssignment.create({
    data: { assignmentId: assignment.id, classId: options.classId },
  });
  const documentFor = (membershipId: string, title: string, text: string) =>
    prisma.document.create({
      data: {
        title,
        text,
        html: sampleEntryHtml(text),
        revision: 2,
        membershipId,
        assignmentTypeId: options.assignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
        ...(moduleSessions.length
          ? { assignmentModuleSessions: { create: moduleSessions } }
          : {}),
      },
    });

  const submissionIds: string[] = [];
  for (const entry of DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES) {
    const membershipId = options.studentMembershipIds[entry.personaKey];
    if (!membershipId) continue;

    const document = await documentFor(membershipId, entry.title, entry.text);
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        title: entry.title,
        text: entry.text,
        html: sampleEntryHtml(entry.text),
        ...sampleSubmissionGradeData(entry, {
          teacherMembershipId: options.teacherMembershipId,
          assignmentTypeId: options.assignmentTypeId,
        }),
      },
    });
    submissionIds.push(submission.id);

    await prisma.submissionGradingAssistantRun.create({
      data: {
        submissionId: submission.id,
        assignmentTypeId: options.assignmentTypeId,
        assignmentTypeGradingVersion: 1,
        assignmentTypeRubricSnapshot: sampleRubricSnapshot(),
        assignmentTypePromptConfigSnapshot:
          DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG as unknown as Prisma.InputJsonValue,
        source: 'daily-pages-short-form-default',
        model: 'seeded-sample',
        status: 'succeeded',
        metadata: { seeded: true } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const draftMembershipId =
    options.studentMembershipIds[DAILY_PAGES_ANALYZE_SAMPLE_DRAFT.personaKey];
  if (draftMembershipId) {
    await documentFor(
      draftMembershipId,
      DAILY_PAGES_ANALYZE_SAMPLE_DRAFT.title,
      DAILY_PAGES_ANALYZE_SAMPLE_DRAFT.text
    );
  }

  return { assignmentId: assignment.id, submissionIds, alreadySeeded: false };
}

/**
 * The seeded world's Daily Pages type, class, teacher and four students.
 *
 * `seed-local-dev` knows these ids because it just created them. A preview
 * whose database already existed runs `sync-prod-fidelity-fixtures` instead —
 * which re-imports the fixture rows, including the Daily Pages row's saved
 * 0-30 rubric — so the samples have to be findable there too, by the dev
 * persona emails the seed uses.
 *
 * Returns null when this is not that world, which is a skip rather than a
 * failure: a database with no dev personas has nothing to attach entries to.
 */
export async function resolveDailyPagesSampleTargets(
  prisma: SeedClient
): Promise<DailyPagesSampleSeedOptions | null> {
  const assignmentType = await prisma.assignmentType.findFirst({
    where: { kind: 'daily_pages', archivedAt: null },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  if (!assignmentType) return null;

  const emails: Record<'teacher' | DailyPagesSamplePersonaKey, string> = {
    teacher: 'dev.teacher@yawp.local',
    student: 'dev.student@yawp.local',
    'student-submitted': 'dev.student.submitted@yawp.local',
    'student-graded': 'dev.student.graded@yawp.local',
    'student-unreleased': 'dev.student.unreleased@yawp.local',
  };

  const memberships = await prisma.orgMembership.findMany({
    where: { user: { email: { in: Object.values(emails) } } },
    select: { id: true, user: { select: { email: true } } },
  });
  const byEmail = new Map(
    memberships.map((membership) => [membership.user?.email, membership.id])
  );

  const teacherMembershipId = byEmail.get(emails.teacher);
  if (!teacherMembershipId) return null;

  const studentEntries = (
    [
      'student',
      'student-submitted',
      'student-graded',
      'student-unreleased',
    ] as const
  ).map((key) => [key, byEmail.get(emails[key])] as const);
  if (studentEntries.some(([, id]) => !id)) return null;

  const klass = await prisma.class.findFirst({
    where: {
      isArchived: false,
      teachers: { some: { id: teacherMembershipId } },
      students: { some: { id: studentEntries[0][1] } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!klass) return null;

  return {
    assignmentTypeId: assignmentType.id,
    classId: klass.id,
    teacherMembershipId,
    studentMembershipIds: Object.fromEntries(
      studentEntries
    ) as DailyPagesSampleSeedOptions['studentMembershipIds'],
  };
}
