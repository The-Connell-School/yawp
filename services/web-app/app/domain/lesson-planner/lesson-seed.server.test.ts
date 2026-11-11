import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
  document: { findMany: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));
// The class summary flag, owned here: other files mock this module
// process-wide, so reading it through a Setting row would test their mock.
const realFeatureFlags = await import(
  '~/domain/feature-flags/feature-flags.server'
);
const isFeatureFlagEnabled = mock(async () => false);
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  ...realFeatureFlags,
  isFeatureFlagEnabled,
}));

const { loadLessonSeed } = await import('./lesson-seed.server');
const { exitTicketResponsesFingerprint } =
  await import('~/domain/assignment-types/exit-ticket-class-summary');

afterAll(() => {
  mock.module(
    '~/domain/feature-flags/feature-flags.server',
    () => realFeatureFlags
  );
  mock.restore();
});

const summaryJson = {
  overview: 'Soft conclusions.',
  categories: [],
  nextSteps: [
    {
      title: 'Teach conclusions that answer "so what?"',
      detail: 'Model two conclusions side by side.',
      rubricCategory: 'organization_and_structure',
    },
  ],
};

function classAssignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ca-1',
    assignment: { title: 'The Crucible argument essay' },
    class: { title: null, grade: 'English 10', period: '3' },
    insight: { status: 'ready', summaryJson },
    ...overrides,
  };
}

beforeEach(() => {
  prisma.classAssignment.findFirst
    .mockReset()
    .mockResolvedValue(classAssignmentRow());
});

describe('loadLessonSeed', () => {
  test('builds a seed from the stored next step', async () => {
    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'ca-1',
      stepIndex: '0',
    });

    expect(seed?.classAssignmentId).toBe('ca-1');
    expect(seed?.prompt).toContain('Teach conclusions that answer "so what?"');
    expect(seed?.prompt).toContain('The Crucible argument essay');
    // The class row has no explicit title, so the banner falls back to the
    // grade/period label teachers see elsewhere in the app.
    expect(seed?.context).toContain('English 10 · Period 3');
  });

  test('scopes the lookup to the calling teacher', async () => {
    await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'ca-1',
      stepIndex: '0',
    });

    expect(
      prisma.classAssignment.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      id: 'ca-1',
      class: { teachers: { some: { id: 'teacher-1' } } },
    });
  });

  test('returns null without querying when no origin is in the URL', async () => {
    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: null,
      stepIndex: null,
    });

    expect(seed).toBeNull();
    expect(prisma.classAssignment.findFirst).not.toHaveBeenCalled();
  });

  test('returns null when the assignment is not the teacher’s', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);
    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'someone-elses',
      stepIndex: '0',
    });
    expect(seed).toBeNull();
  });

  test('returns null when the insight is missing, failed, or unparseable', async () => {
    for (const insight of [
      null,
      { status: 'failed', summaryJson },
      { status: 'ready', summaryJson: null },
      { status: 'ready', summaryJson: { overview: '', nextSteps: [] } },
    ]) {
      prisma.classAssignment.findFirst.mockResolvedValue(
        classAssignmentRow({ insight })
      );
      const seed = await loadLessonSeed({
        membershipId: 'teacher-1',
        classAssignmentId: 'ca-1',
        stepIndex: '0',
      });
      expect(seed).toBeNull();
    }
  });

  test('returns null when the step index points past the end', async () => {
    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'ca-1',
      stepIndex: '7',
    });
    expect(seed).toBeNull();
  });
});

describe('loadLessonSeed from an exit ticket class read', () => {
  function exitTicketRow() {
    return classAssignmentRow({
      assignment: {
        title: 'Exit ticket: erosion',
        exitTicketConfigJson: { schemaVersion: 1, mode: 'basic' },
        assignmentType: { kind: 'exit_ticket' },
      },
      insight: null,
    });
  }

  test('builds the ask from the tickets, not from a class summary', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(exitTicketRow());
    prisma.document.findMany.mockReset().mockResolvedValue([
      {
        membership: { user: { name: 'Dee', email: 'dee@x.test' } },
        group: null,
        submissions: [
          {
            text: 'Why does erosion need water?',
            rubricScores: { understanding: { score: 30 } },
          },
        ],
      },
    ]);

    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'ca-1',
      stepIndex: 'exit-ticket',
    });

    expect(seed?.classAssignmentId).toBe('ca-1');
    expect(seed?.prompt).toContain('Exit ticket: erosion');
    expect(seed?.prompt).toContain('Names it only: 1');
    expect(seed?.prompt).toContain('Why does erosion need water?');
    expect(seed?.prompt).not.toContain('Dee');
  });

  test('is no seed for an assignment that is not an exit ticket', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(
      classAssignmentRow({
        assignment: {
          title: 'Essay',
          exitTicketConfigJson: null,
          assignmentType: { kind: null },
        },
      })
    );
    prisma.document.findMany.mockReset().mockResolvedValue([]);

    expect(
      await loadLessonSeed({
        membershipId: 'teacher-1',
        classAssignmentId: 'ca-1',
        stepIndex: 'exit-ticket',
      })
    ).toBeNull();
  });

  test('is no seed before any ticket has come back', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(exitTicketRow());
    prisma.document.findMany.mockReset().mockResolvedValue([]);

    expect(
      await loadLessonSeed({
        membershipId: 'teacher-1',
        classAssignmentId: 'ca-1',
        stepIndex: 'exit-ticket',
      })
    ).toBeNull();
  });

  describe('with a stored class summary', () => {
    const summaryJson = {
      understood: 'Most of the class can say what erosion is.',
      confusions: [
        { point: 'Some think weathering moves rock.', share: 'some' },
      ],
      reteach: 'quick-review',
      reteachReason: 'The two words are still blurring together.',
      nextLessonMove: {
        title: 'Sort the verbs',
        minutes: 6,
        detail: 'Sort ten sentences into breaks or moves.',
      },
    };
    const documents = [
      {
        membership: { user: { name: 'Dee', email: 'dee@x.test' } },
        group: null,
        submissions: [
          {
            text: 'Why does erosion need water?',
            rubricScores: { understanding: { score: 30 } },
          },
        ],
      },
    ];

    async function seedWith({
      flagOn,
      fingerprint,
    }: {
      flagOn: boolean;
      fingerprint: string;
    }) {
      prisma.classAssignment.findFirst.mockResolvedValue({
        ...exitTicketRow(),
        class: {
          title: null,
          grade: 'English 10',
          period: '3',
          school: { organizationId: 'org-1' },
        },
        exitTicketSummary: {
          summaryJson,
          responseCount: 1,
          inputFingerprint: fingerprint,
          generatedAt: new Date('2026-11-02T15:00:00Z'),
        },
      });
      prisma.document.findMany.mockReset().mockResolvedValue(documents);
      isFeatureFlagEnabled.mockReset().mockResolvedValue(flagOn);
      return loadLessonSeed({
        membershipId: 'teacher-1',
        classAssignmentId: 'ca-1',
        stepIndex: 'exit-ticket',
      });
    }

    const CURRENT = exitTicketResponsesFingerprint([
      { text: 'Why does erosion need water?' },
    ]);

    test('adds the call and the suggested opening to the ask', async () => {
      const seed = await seedWith({ flagOn: true, fingerprint: CURRENT });
      expect(seed?.prompt).toContain(summaryJson.understood);
      expect(seed?.prompt).toContain('Recommendation: Quick review');
      expect(seed?.prompt).toContain('Sort the verbs (6 min)');
      expect(seed?.prompt).not.toContain('Dee');
    });

    test('leaves it out once new responses have come in', async () => {
      const seed = await seedWith({ flagOn: true, fingerprint: 'stale' });
      expect(seed?.prompt).not.toContain(summaryJson.understood);
      expect(seed?.prompt).toContain('Why does erosion need water?');
    });

    test('leaves it out while the flag is off', async () => {
      const seed = await seedWith({ flagOn: false, fingerprint: CURRENT });
      expect(seed?.prompt).not.toContain(summaryJson.understood);
    });
  });
});
