import { describe, expect, test } from 'bun:test';

// From the same wrapper the seed uses, so `toBe` compares the identical
// sentinel rather than a second copy loaded through a different entry point.
import { Prisma } from '../../index';
import {
  DAILY_PAGES_SAMPLE_ASSIGNMENT,
  DAILY_PAGES_SAMPLE_ENTRIES,
} from '../../../../services/web-app/app/domain/assignment-types/daily-pages-sample-entries.ts';
import {
  DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT,
  DAILY_PAGES_ANALYZE_SAMPLE_DRAFT,
  DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES,
} from '../../../../services/web-app/app/domain/assignment-types/daily-pages-analyze-sample-entries.ts';
import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS,
  DAILY_PAGES_SHORT_FORM_WELCOME,
} from '../../../../services/web-app/app/domain/assignment-types/daily-pages-short-form-rubric.ts';
import {
  sampleEntryHtml,
  seedDailyPagesAnalyzeSamples,
  seedDailyPagesSampleEntries,
} from './seed-daily-pages-samples';

type Call = { args: any };

function fakePrisma({
  modules = 1,
  existingAssignmentId = null,
}: { modules?: number; existingAssignmentId?: string | null } = {}) {
  const calls: Record<string, Call[]> = {
    assignmentTypeUpdate: [],
    moduleUpdateMany: [],
    instructionUpdateMany: [],
    messageUpdateMany: [],
    assignmentCreate: [],
    classAssignmentCreate: [],
    documentCreate: [],
    submissionCreate: [],
    runCreate: [],
  };
  let ids = 0;
  const nextId = (prefix: string) => `${prefix}-${++ids}`;

  const prisma = {
    assignmentType: {
      update: async (args: unknown) => {
        calls.assignmentTypeUpdate.push({ args });
        return {};
      },
    },
    assignmentModule: {
      updateMany: async (args: unknown) => {
        calls.moduleUpdateMany.push({ args });
        return { count: modules };
      },
      findMany: async () =>
        Array.from({ length: modules }, (_unused, index) => ({
          id: `module-${index + 1}`,
          instructions: [{ id: `instruction-${index + 1}`, prompt: 'Write.' }],
        })),
    },
    assignmentModuleInstruction: {
      updateMany: async (args: unknown) => {
        calls.instructionUpdateMany.push({ args });
        return { count: modules };
      },
    },
    assignmentModuleSessionMessage: {
      updateMany: async (args: unknown) => {
        calls.messageUpdateMany.push({ args });
        return { count: 0 };
      },
    },
    assignment: {
      findFirst: async () =>
        existingAssignmentId ? { id: existingAssignmentId } : null,
      create: async (args: unknown) => {
        calls.assignmentCreate.push({ args });
        return { id: 'assignment-1' };
      },
    },
    classAssignment: {
      create: async (args: unknown) => {
        calls.classAssignmentCreate.push({ args });
        return { id: 'class-assignment-1' };
      },
    },
    document: {
      create: async (args: unknown) => {
        calls.documentCreate.push({ args });
        return { id: nextId('document') };
      },
    },
    submission: {
      create: async (args: unknown) => {
        calls.submissionCreate.push({ args });
        return { id: nextId('submission') };
      },
    },
    submissionGradingAssistantRun: {
      create: async (args: unknown) => {
        calls.runCreate.push({ args });
        return { id: nextId('run') };
      },
    },
  };

  return { prisma, calls };
}

const options = {
  assignmentTypeId: 'daily-pages-type',
  classId: 'class-1',
  teacherMembershipId: 'teacher-1',
  studentMembershipIds: {
    student: 'student-1',
    'student-submitted': 'student-2',
    'student-graded': 'student-3',
    'student-unreleased': 'student-4',
  },
} as const;

describe('seedDailyPagesSampleEntries', () => {
  test('clears the seeded type’s saved rubric so the split is what a preview shows', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesSampleEntries(prisma as never, options);

    expect(calls.assignmentTypeUpdate).toHaveLength(1);
    const { data } = calls.assignmentTypeUpdate[0].args;
    // A saved rubric always wins, and the fixture's is the old 0-30
    // engagement one. Left in place, the preview grades as it did before.
    expect(data.rubricJson).toBe(Prisma.DbNull);
    expect(data.scoringScaleJson).toBe(Prisma.DbNull);
    expect(data.gradingPromptConfigJson).toBe(Prisma.DbNull);
  });

  test('creates one graded submission per sample entry', async () => {
    const { prisma, calls } = fakePrisma();

    const result = await seedDailyPagesSampleEntries(prisma as never, options);

    expect(calls.assignmentCreate).toHaveLength(1);
    expect(calls.assignmentCreate[0].args.data.prompt).toBe(
      DAILY_PAGES_SAMPLE_ASSIGNMENT.prompt
    );
    expect(calls.assignmentCreate[0].args.data.submitForGrade).toBe(true);
    expect(calls.documentCreate).toHaveLength(
      DAILY_PAGES_SAMPLE_ENTRIES.length
    );
    expect(calls.submissionCreate).toHaveLength(
      DAILY_PAGES_SAMPLE_ENTRIES.length
    );
    expect(result.submissionIds).toHaveLength(
      DAILY_PAGES_SAMPLE_ENTRIES.length
    );
  });

  test('stores scores, per-category comments and a grade on every entry', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesSampleEntries(prisma as never, options);

    for (const call of calls.submissionCreate) {
      const { data } = call.args;
      expect(Object.keys(data.rubricScores).sort()).toEqual(
        [...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS].sort()
      );
      for (const key of DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS) {
        expect(typeof data.rubricScores[key].score).toBe('number');
        expect(data.rubricScores[key].comment.length).toBeGreaterThan(0);
      }
      expect(typeof data.numericPercentage).toBe('number');
      expect(data.letterGrade).toMatch(/^[ABCDF]$/);
      expect(data.gradedByMembershipId).toBe(options.teacherMembershipId);
      expect(data.grammarIssues.version).toBe(1);
    }
  });

  test('leaves exactly one entry graded but unreleased', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesSampleEntries(prisma as never, options);

    const unreleased = calls.submissionCreate.filter(
      (call) => call.args.data.releasedAt === null
    );
    expect(unreleased).toHaveLength(1);
  });

  test('records a grading run carrying the rubric the entries were scored on', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesSampleEntries(prisma as never, options);

    expect(calls.runCreate).toHaveLength(DAILY_PAGES_SAMPLE_ENTRIES.length);
    for (const call of calls.runCreate) {
      const { data } = call.args;
      // The submission view reads this snapshot before it reads the type, so
      // the entries keep their rubric even if the type is reconfigured.
      expect(data.source).toBe('daily-pages-short-form-default');
      expect(data.assignmentTypeRubricSnapshot.categories).toHaveLength(
        DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS.length
      );
      expect(data.assignmentTypeRubricSnapshot.scoringType).toBe(
        'weighted_1_5'
      );
    }
  });

  test('gives each document a session per module, so it opens', async () => {
    const { prisma, calls } = fakePrisma({ modules: 2 });

    await seedDailyPagesSampleEntries(prisma as never, options);

    for (const call of calls.documentCreate) {
      expect(call.args.data.assignmentModuleSessions.create).toHaveLength(2);
    }
  });

  test('omits the sessions block for a type with no modules', async () => {
    const { prisma, calls } = fakePrisma({ modules: 0 });

    await seedDailyPagesSampleEntries(prisma as never, options);

    for (const call of calls.documentCreate) {
      expect(call.args.data.assignmentModuleSessions).toBeUndefined();
    }
  });

  test('creates nothing on a second run, but still resets the rubric', async () => {
    const { prisma, calls } = fakePrisma({
      existingAssignmentId: 'existing-assignment',
    });

    const result = await seedDailyPagesSampleEntries(prisma as never, options);

    expect(result.alreadySeeded).toBe(true);
    expect(result.assignmentId).toBe('existing-assignment');
    expect(calls.assignmentCreate).toHaveLength(0);
    expect(calls.submissionCreate).toHaveLength(0);
    // The rubric reset still runs: the fixture sync restores the old one on
    // every deploy, so skipping it here would undo the split each time.
    expect(calls.assignmentTypeUpdate).toHaveLength(1);
  });

  test('points the seeded Tutor at paragraph-practice coaching', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesSampleEntries(prisma as never, options);

    expect(calls.moduleUpdateMany).toHaveLength(1);
    const { data } = calls.moduleUpdateMany[0].args;
    // The shipped row is the freewrite tutor, which coaches the exploration
    // this assignment type no longer wants.
    expect(data.tutorInstructions).toContain('paragraph practice');
    // No single form: the module blurb does not pin the claim to sentence one.
    expect(data.description).not.toContain('first sentence');
    expect(data.tutorInstructions).not.toContain('probing questions');
    // Without an alignment, no rubric language reaches the tutor at all.
    expect(data.rubricAlignmentJson.depth_of_thought).toBe('primary');
    expect(data.rubricAlignmentJson.voice_and_style).toBe('supporting');
  });

  /**
   * The step joined after the module text was still the freewrite tutor, so
   * the tutor was told both to coach one deliberate move and to encourage
   * exploring. Seeded environments get the paragraph-practice step instead.
   */
  test('replaces the freewrite step instructions and welcome', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesSampleEntries(prisma as never, options);

    expect(calls.instructionUpdateMany).toHaveLength(1);
    const { where, data } = calls.instructionUpdateMany[0].args;
    expect(where.assignmentModule.assignmentTypeId).toBe(
      options.assignmentTypeId
    );
    expect(data.tutorInstructions).toBe(
      DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS
    );
    expect(data.prompt).toBe(DAILY_PAGES_SHORT_FORM_WELCOME);
  });

  /**
   * A document stores the welcome as its first tutor message when it is
   * created, so documents seeded before this change would keep showing the
   * old one. Only that exact message is rewritten; nothing a student or the
   * tutor actually said is touched.
   */
  test('rewrites only the stored copies of the old welcome', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesSampleEntries(prisma as never, options);

    expect(calls.messageUpdateMany).toHaveLength(1);
    const { where, data } = calls.messageUpdateMany[0].args;
    expect(where.agent).toBe('assistant');
    expect(where.content.contains).toContain(
      'You may not need or want feedback'
    );
    expect(
      where.assignmentModuleSession.assignmentModule.assignmentTypeId
    ).toBe(options.assignmentTypeId);
    expect(data.content).toBe(DAILY_PAGES_SHORT_FORM_WELCOME);
  });

  test('wraps each paragraph for the editor', () => {
    expect(sampleEntryHtml('One.\n\nTwo.')).toBe('<p>One.</p><p>Two.</p>');
  });
});

/**
 * The Analyze class set: a Daily Pages assignment run as an analysis
 * paragraph, three graded entries, and one draft left open for the live tutor.
 */
describe('seedDailyPagesAnalyzeSamples', () => {
  test('creates an Analyze assignment, timed, on the library prompt', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesAnalyzeSamples(prisma as never, options);

    expect(calls.assignmentCreate).toHaveLength(1);
    const { data } = calls.assignmentCreate[0].args;
    expect(data.paragraphMode).toBe('analyze');
    expect(data.writingTimeMinutes).toBe(15);
    expect(data.tutorEnabled).toBe(true);
    expect(data.prompt).toBe(DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.prompt);
    expect(calls.classAssignmentCreate[0].args.data.classId).toBe('class-1');
  });

  test('grades the three entries and leaves the draft unsubmitted', async () => {
    const { prisma, calls } = fakePrisma();

    const result = await seedDailyPagesAnalyzeSamples(prisma as never, options);

    expect(calls.documentCreate).toHaveLength(
      DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES.length + 1
    );
    expect(calls.submissionCreate).toHaveLength(
      DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES.length
    );
    expect(calls.runCreate).toHaveLength(
      DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES.length
    );
    expect(result.submissionIds).toHaveLength(
      DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES.length
    );

    const draft = calls.documentCreate.find(
      (call) => call.args.data.text === DAILY_PAGES_ANALYZE_SAMPLE_DRAFT.text
    );
    expect(draft?.args.data.membershipId).toBe('student-1');
    // Opening the draft needs a tutor session, or the tutor has nowhere to run.
    expect(draft?.args.data.assignmentModuleSessions.create).toHaveLength(1);
  });

  test('releases two grades and holds one back', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesAnalyzeSamples(prisma as never, options);

    const released = calls.submissionCreate.filter(
      (call) => call.args.data.releasedAt !== null
    );
    expect(released).toHaveLength(2);
  });

  test('leaves the type’s rubric and tutor to the first sample set', async () => {
    const { prisma, calls } = fakePrisma();

    await seedDailyPagesAnalyzeSamples(prisma as never, options);

    expect(calls.assignmentTypeUpdate).toHaveLength(0);
    expect(calls.moduleUpdateMany).toHaveLength(0);
  });

  test('creates nothing on a second run', async () => {
    const { prisma, calls } = fakePrisma({
      existingAssignmentId: 'existing-analyze',
    });

    const result = await seedDailyPagesAnalyzeSamples(prisma as never, options);

    expect(result.alreadySeeded).toBe(true);
    expect(calls.assignmentCreate).toHaveLength(0);
    expect(calls.documentCreate).toHaveLength(0);
  });
});
