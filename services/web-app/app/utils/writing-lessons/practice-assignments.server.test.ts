import { beforeEach, describe, expect, mock, test } from 'bun:test';

const writingPracticeAssignment = { create: mock() };
const writingPracticeAttempt = { create: mock() };
const writingPracticeClassAssignment = { findMany: mock(), findFirst: mock() };
const writingPracticePromptSet = { findUnique: mock(), create: mock() };
const getLLMCompletion = mock();

mock.module('~/utils/db.server', () => ({
  prisma: {
    writingPracticeAssignment,
    writingPracticeAttempt,
    writingPracticeClassAssignment,
    writingPracticePromptSet,
  },
}));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const {
  createWritingPracticeAssignmentForClasses,
  recordWritingPracticeAttempt,
  recordCompositionPracticeAttempt,
  getAssignedPracticeForStudent,
  buildAssignedPracticeSequence,
  summarizeWritingPracticeResults,
  computeAssignedProgress,
  buildGeneratedPracticeSequence,
  buildMixedGeneratedPracticeSequence,
  getOrCreateStudentPracticeSet,
  getWritingPracticeResultsForTeacher,
} = await import('./practice-assignments.server');

beforeEach(() => {
  writingPracticeAssignment.create.mockReset();
  writingPracticeAttempt.create.mockReset();
  writingPracticeClassAssignment.findMany.mockReset();
  writingPracticeClassAssignment.findFirst.mockReset();
  writingPracticePromptSet.findUnique.mockReset();
  writingPracticePromptSet.create.mockReset();
  getLLMCompletion.mockReset();
});

function mockGeneratedPrompts(prompts: Array<{ exercise: string }>) {
  getLLMCompletion.mockResolvedValue(
    JSON.stringify({
      prompts: prompts.map((prompt) => ({
        exercise: prompt.exercise,
        instruction: 'Fix it.',
      })),
    })
  );
}

function mockGeneratedActQuestions(
  questions: Array<{
    sentence: string;
    underline: string;
    choices: string[];
    correctChoiceIndex: number;
  }>
) {
  getLLMCompletion.mockResolvedValue(
    JSON.stringify({
      questions: questions.map((question) => ({
        ...question,
        explanation: 'Because it fixes the error.',
      })),
    })
  );
}

describe('createWritingPracticeAssignmentForClasses', () => {
  test('creates one assignment and deploys to de-duplicated classes', async () => {
    writingPracticeAssignment.create.mockResolvedValueOnce({ id: 'wpa-1' });

    await createWritingPracticeAssignmentForClasses(
      {
        createdByMembershipId: 'teacher-1',
        title: 'Comma week',
        lessonSlugs: ['fixing-comma-splices'],
        problemCount: 3,
        dueAt: null,
        instructions: null,
      },
      ['class-a', 'class-a', 'class-b']
    );

    expect(writingPracticeAssignment.create).toHaveBeenCalledTimes(1);
    const arg = writingPracticeAssignment.create.mock.calls[0][0];
    expect(arg.data.createdByMembershipId).toBe('teacher-1');
    expect(arg.data.lessonSlugs).toEqual(['fixing-comma-splices']);
    expect(arg.data.problemCount).toBe(3);
    expect(arg.data.classAssignments.create).toEqual([
      { classId: 'class-a' },
      { classId: 'class-b' },
    ]);
  });
});

describe('recordWritingPracticeAttempt', () => {
  const question = {
    id: 'fixing-comma-splices-act-1',
    sentence: 'The album dropped, fans went wild.',
    underline: 'dropped, fans',
    choices: [
      'dropped, fans',
      'dropped; fans',
      'dropped fans',
      'dropped, and, fans',
    ],
    correctChoiceIndex: 1,
    explanation: 'A semicolon joins the two independent clauses.',
  };

  test('persists a correct ACT attempt as strong with the snapshot record', async () => {
    writingPracticeAttempt.create.mockResolvedValueOnce({ id: 'att-1' });

    await recordWritingPracticeAttempt({
      classAssignmentId: 'wpca-1',
      membershipId: 'student-1',
      lessonSlug: 'fixing-comma-splices',
      question,
      selectedChoiceIndex: 1,
      grade: {
        correct: true,
        correctChoiceIndex: 1,
        explanation: question.explanation,
      },
    });

    const arg = writingPracticeAttempt.create.mock.calls[0][0];
    expect(arg.data.status).toBe('strong');
    expect(arg.data.promptId).toBe('fixing-comma-splices-act-1');
    expect(arg.data.response).toBe('dropped; fans');
    expect(arg.data.membershipId).toBe('student-1');
    expect(arg.data.feedbackJson).toMatchObject({
      kind: 'act',
      correct: true,
      selectedChoiceIndex: 1,
      correctChoiceIndex: 1,
    });
  });

  test('records an incorrect pick as needs_revision', async () => {
    writingPracticeAttempt.create.mockResolvedValueOnce({ id: 'att-2' });

    await recordWritingPracticeAttempt({
      classAssignmentId: 'wpca-1',
      membershipId: 'student-1',
      lessonSlug: 'fixing-comma-splices',
      question,
      selectedChoiceIndex: 0,
      grade: {
        correct: false,
        correctChoiceIndex: 1,
        explanation: question.explanation,
      },
    });

    const arg = writingPracticeAttempt.create.mock.calls[0][0];
    expect(arg.data.status).toBe('needs_revision');
    expect(arg.data.feedbackJson.correct).toBe(false);
  });
});

describe('getAssignedPracticeForStudent', () => {
  test('scopes to the student’s classes and only their attempts', async () => {
    writingPracticeClassAssignment.findMany.mockResolvedValueOnce([]);

    await getAssignedPracticeForStudent('student-1');

    const arg = writingPracticeClassAssignment.findMany.mock.calls[0][0];
    expect(arg.where.class.students.some.id).toBe('student-1');
    expect(arg.include.attempts.where.membershipId).toBe('student-1');
  });
});

describe('buildAssignedPracticeSequence', () => {
  test('produces the requested number of problems from a single lesson', () => {
    const sequence = buildAssignedPracticeSequence(['fixing-comma-splices'], 3);

    expect(sequence).toHaveLength(3);
    expect(sequence.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(
      sequence.every((item) => item.lessonSlug === 'fixing-comma-splices')
    ).toBe(true);
    expect(sequence[0].lessonTitle).toBe('Fixing Comma Splices');
  });

  test('cycles prompts when problemCount exceeds available prompts', () => {
    const sequence = buildAssignedPracticeSequence(['fixing-comma-splices'], 6);

    // Only 4 distinct prompts exist, so #5 reuses the first prompt.
    expect(sequence).toHaveLength(6);
    expect(sequence[4].prompt.id).toBe(sequence[0].prompt.id);
  });

  test('interleaves prompts across multiple lessons', () => {
    const sequence = buildAssignedPracticeSequence(
      ['fixing-comma-splices', 'revising-for-wordiness'],
      4
    );

    expect(sequence.map((item) => item.lessonSlug)).toEqual([
      'fixing-comma-splices',
      'revising-for-wordiness',
      'fixing-comma-splices',
      'revising-for-wordiness',
    ]);
  });

  test('returns an empty sequence for no problems or unknown lessons', () => {
    expect(buildAssignedPracticeSequence(['fixing-comma-splices'], 0)).toEqual(
      []
    );
    expect(buildAssignedPracticeSequence(['not-a-lesson'], 3)).toEqual([]);
  });
});

describe('buildGeneratedPracticeSequence', () => {
  test('uses generated prompts, interleaved across skills', async () => {
    mockGeneratedPrompts([
      { exercise: 'generated one' },
      { exercise: 'generated two' },
    ]);

    const { items, source } = await buildGeneratedPracticeSequence(
      ['fixing-comma-splices', 'passive-voice'],
      4
    );

    expect(source).toBe('ai');
    expect(items.map((item) => item.lessonSlug)).toEqual([
      'fixing-comma-splices',
      'passive-voice',
      'fixing-comma-splices',
      'passive-voice',
    ]);
    expect(items[0].prompt.exercise).toContain('generated');
    expect(items[0].prompt.id).toContain('-gen-');
  });

  test('falls back to the static bank when generation returns nothing', async () => {
    getLLMCompletion.mockRejectedValue(new Error('no provider'));

    const { items, source } = await buildGeneratedPracticeSequence(
      ['fixing-comma-splices'],
      3
    );

    expect(source).toBe('static');
    expect(items).toHaveLength(3);
    // Static prompt ids look like "fixing-comma-splices-1", not "-gen-".
    expect(items[0].prompt.id).not.toContain('-gen-');
  });
});

describe('getOrCreateStudentPracticeSet', () => {
  test('returns the stored set without regenerating when one exists', async () => {
    const stored = [
      {
        position: 1,
        lessonSlug: 'fixing-comma-splices',
        lessonTitle: 'Fixing Comma Splices',
        question: {
          id: 'x',
          sentence: 'A, B.',
          underline: 'A, B',
          choices: ['A, B', 'A; B', 'A B', 'A, and, B'],
          correctChoiceIndex: 1,
          explanation: 'y',
        },
      },
    ];
    writingPracticePromptSet.findUnique.mockResolvedValueOnce({
      promptsJson: stored,
    });

    const items = await getOrCreateStudentPracticeSet({
      classAssignmentId: 'ca-1',
      membershipId: 'student-1',
      lessonSlugs: ['fixing-comma-splices'],
      problemCount: 5,
    });

    expect(items).toEqual(stored);
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(writingPracticePromptSet.create).not.toHaveBeenCalled();
  });

  test('generates and persists an ACT set on first access', async () => {
    writingPracticePromptSet.findUnique.mockResolvedValueOnce(null);
    mockGeneratedActQuestions([
      {
        sentence: 'The comet appeared, they cheered.',
        underline: 'appeared, they',
        choices: [
          'appeared, they',
          'appeared; they',
          'appeared they',
          'appeared, and, they',
        ],
        correctChoiceIndex: 1,
      },
      {
        sentence: 'It rained, we stayed inside.',
        underline: 'rained, we',
        choices: ['rained, we', 'rained; we', 'rained we', 'rained, and, we'],
        correctChoiceIndex: 1,
      },
    ]);
    writingPracticePromptSet.create.mockImplementationOnce(
      async ({ data }) => ({
        promptsJson: data.promptsJson,
      })
    );

    const items = await getOrCreateStudentPracticeSet({
      classAssignmentId: 'ca-1',
      membershipId: 'student-1',
      lessonSlugs: ['fixing-comma-splices'],
      problemCount: 2,
    });

    expect(writingPracticePromptSet.create).toHaveBeenCalledTimes(1);
    const createArg = writingPracticePromptSet.create.mock.calls[0][0];
    expect(createArg.data.source).toBe('ai');
    expect(items).toHaveLength(2);
    const first = items[0];
    expect(first.kind).toBe('act');
    if (first.kind !== 'composition') {
      expect(first.question.sentence).toContain('comet');
      expect(first.question.choices).toHaveLength(4);
    }
  });
});

describe('getWritingPracticeResultsForTeacher', () => {
  test('groups each student’s ACT attempts with the question, pick, and grade', async () => {
    const record = {
      kind: 'act' as const,
      sentence: 'The album dropped, fans went wild.',
      underline: 'dropped, fans',
      choices: [
        'dropped, fans',
        'dropped; fans',
        'dropped fans',
        'dropped, and, fans',
      ],
      selectedChoiceIndex: 1,
      correctChoiceIndex: 1,
      correct: true,
      explanation: 'A semicolon joins the two independent clauses.',
    };
    writingPracticeClassAssignment.findFirst.mockResolvedValueOnce({
      id: 'wpca-1',
      assignment: {
        problemCount: 2,
        lessonSlugs: ['fixing-comma-splices'],
        title: 'Comma week',
        dueAt: null,
      },
      class: {
        id: 'class-1',
        title: 'Period 1',
        grade: '9',
        period: '1',
        students: [{ id: 's-1', user: { name: 'Aaron', email: 'a@x.com' } }],
      },
      attempts: [
        {
          id: 'att-1',
          membershipId: 's-1',
          lessonSlug: 'fixing-comma-splices',
          promptId: 'fixing-comma-splices-act-1',
          exercise: record.sentence,
          instruction: record.underline,
          response: 'dropped; fans',
          status: 'strong',
          feedbackJson: record,
          createdAt: new Date('2026-07-01T10:00:00Z'),
        },
      ],
    });

    const data = await getWritingPracticeResultsForTeacher(
      'wpca-1',
      'teacher-1'
    );

    expect(data).not.toBeNull();
    const attempts = data!.attemptsByStudent['s-1'];
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe('strong');
    expect(attempts[0].attempt).toEqual(record);
    // Scoped to a class this teacher owns.
    const where =
      writingPracticeClassAssignment.findFirst.mock.calls[0][0].where;
    expect(where.class.teachers.some.id).toBe('teacher-1');
  });

  test('returns null when the deployment is not the teacher’s', async () => {
    writingPracticeClassAssignment.findFirst.mockResolvedValueOnce(null);
    expect(
      await getWritingPracticeResultsForTeacher('wpca-x', 'teacher-1')
    ).toBeNull();
  });
});

describe('summarizeWritingPracticeResults', () => {
  const students = [
    { id: 's-2', user: { name: 'Bianca', email: 'bianca@example.com' } },
    { id: 's-1', user: { name: 'Aaron', email: 'aaron@example.com' } },
    { id: 's-3', user: { name: null, email: 'cara@example.com' } },
  ];

  test('rolls attempts up per student, sorted by email, marking completion', () => {
    const results = summarizeWritingPracticeResults({
      students,
      problemCount: 2,
      attempts: [
        // Aaron answered two distinct grammar problems.
        {
          membershipId: 's-1',
          promptId: 'fixing-comma-splices-1',
          lessonSlug: 'fixing-comma-splices',
          status: 'developing',
          createdAt: new Date('2026-07-01T10:00:00Z'),
        },
        {
          membershipId: 's-1',
          promptId: 'fixing-comma-splices-2',
          lessonSlug: 'fixing-comma-splices',
          status: 'strong',
          createdAt: new Date('2026-07-01T11:00:00Z'),
        },
        {
          membershipId: 's-2',
          promptId: 'fixing-comma-splices-1',
          lessonSlug: 'fixing-comma-splices',
          status: 'needs_revision',
          createdAt: new Date('2026-07-01T09:00:00Z'),
        },
      ],
    });

    expect(results.map((r) => r.email)).toEqual([
      'aaron@example.com',
      'bianca@example.com',
      'cara@example.com',
    ]);

    const aaron = results[0];
    expect(aaron.attemptCount).toBe(2);
    // Grammar problems are done as soon as they're answered.
    expect(aaron.completed).toBe(true);
    expect(aaron.latestStatus).toBe('strong'); // most recent wins

    const bianca = results[1];
    expect(bianca.attemptCount).toBe(1);
    expect(bianca.completed).toBe(false);

    const cara = results[2];
    expect(cara.attemptCount).toBe(0);
    expect(cara.completed).toBe(false);
    expect(cara.latestStatus).toBeNull();
  });

  test('collapses composition revisions and gates completion on mastery', () => {
    const results = summarizeWritingPracticeResults({
      students: [students[1]], // just Aaron (s-1)
      problemCount: 2,
      attempts: [
        // Problem 1: revised twice, then mastered — one problem, mastered.
        {
          membershipId: 's-1',
          promptId: 'topic-sentences-1',
          lessonSlug: 'topic-sentences',
          status: 'needs_revision',
          createdAt: new Date('2026-07-01T10:00:00Z'),
        },
        {
          membershipId: 's-1',
          promptId: 'topic-sentences-1',
          lessonSlug: 'topic-sentences',
          status: 'developing',
          createdAt: new Date('2026-07-01T10:05:00Z'),
        },
        {
          membershipId: 's-1',
          promptId: 'topic-sentences-1',
          lessonSlug: 'topic-sentences',
          status: 'strong',
          createdAt: new Date('2026-07-01T10:10:00Z'),
        },
        // Problem 2: attempted but never mastered.
        {
          membershipId: 's-1',
          promptId: 'topic-sentences-2',
          lessonSlug: 'topic-sentences',
          status: 'developing',
          createdAt: new Date('2026-07-01T10:20:00Z'),
        },
      ],
    });

    const aaron = results[0];
    // Two distinct problems attempted (three revisions of #1 collapse to one).
    expect(aaron.attemptCount).toBe(2);
    expect(aaron.masteredCount).toBe(1);
    // Not complete: composition problem #2 was never mastered.
    expect(aaron.completed).toBe(false);
    expect(aaron.latestStatus).toBe('developing');
  });
});

describe('computeAssignedProgress', () => {
  test('composition done requires mastery; ACT done on any attempt', () => {
    const progress = computeAssignedProgress([
      // Composition mastered
      {
        promptId: 'topic-sentences-1',
        lessonSlug: 'topic-sentences',
        status: 'strong',
      },
      // Composition attempted, not mastered
      {
        promptId: 'topic-sentences-2',
        lessonSlug: 'topic-sentences',
        status: 'needs_revision',
      },
      // Grammar answered (done regardless of correctness)
      {
        promptId: 'fixing-comma-splices-1',
        lessonSlug: 'fixing-comma-splices',
        status: 'needs_revision',
      },
    ]);

    expect(progress.attemptedCount).toBe(3);
    expect(progress.masteredCount).toBe(1);
    // topic-sentences-1 (mastered) + fixing-comma-splices-1 (answered) = 2 done.
    expect(progress.doneCount).toBe(2);
  });
});

describe('buildMixedGeneratedPracticeSequence', () => {
  test('composition-only slugs produce constructed-response items', async () => {
    getLLMCompletion.mockRejectedValue(new Error('offline'));

    const { items, source } = await buildMixedGeneratedPracticeSequence(
      ['topic-sentences', 'thesis-statements'],
      4
    );

    expect(source).toBe('static');
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.position)).toEqual([1, 2, 3, 4]);
    for (const item of items) {
      expect(item.kind).toBe('composition');
      if (item.kind === 'composition') {
        expect(item.prompt.exercise.length).toBeGreaterThan(0);
        expect(item.prompt.instruction.length).toBeGreaterThan(0);
      }
    }
    // Skills interleave round-robin.
    expect(items[0].lessonSlug).toBe('topic-sentences');
    expect(items[1].lessonSlug).toBe('thesis-statements');
  });

  test('grammar-only slugs keep producing ACT items', async () => {
    getLLMCompletion.mockRejectedValue(new Error('offline'));

    const { items } = await buildMixedGeneratedPracticeSequence(
      ['fixing-comma-splices'],
      3
    );

    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.kind).toBe('act');
      if (item.kind === 'act') {
        expect(item.question.choices).toHaveLength(4);
      }
    }
  });

  test('mixed slugs interleave ACT and constructed-response items', async () => {
    getLLMCompletion.mockRejectedValue(new Error('offline'));

    const { items } = await buildMixedGeneratedPracticeSequence(
      ['fixing-comma-splices', 'topic-sentences'],
      6
    );

    expect(items).toHaveLength(6);
    expect(items.map((item) => item.position)).toEqual([1, 2, 3, 4, 5, 6]);
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds.has('act')).toBe(true);
    expect(kinds.has('composition')).toBe(true);
    // Kinds alternate rather than clustering all of one skill first.
    expect(items[0].kind).not.toBe(items[1].kind);
  });

  test('a single problem with mixed slugs still yields exactly one item', async () => {
    getLLMCompletion.mockRejectedValue(new Error('offline'));

    const { items } = await buildMixedGeneratedPracticeSequence(
      ['fixing-comma-splices', 'topic-sentences'],
      1
    );

    expect(items).toHaveLength(1);
    expect(items[0].position).toBe(1);
  });
});

describe('recordCompositionPracticeAttempt', () => {
  test('persists the prompt snapshot, response, and feedback', async () => {
    writingPracticeAttempt.create.mockResolvedValue({ id: 'attempt-1' });

    await recordCompositionPracticeAttempt({
      classAssignmentId: 'ca-1',
      membershipId: 'student-1',
      lessonSlug: 'topic-sentences',
      prompt: {
        id: 'topic-sentences-1',
        exercise: 'Rewrite this announcement as a claim.',
        instruction: 'Write a topic sentence.',
      },
      response: 'The cafeteria menu punishes the students who need lunch most.',
      feedback: {
        status: 'strong',
        summary: 'A clear, arguable claim.',
        strengths: ['Specific and arguable.'],
        focus: ['Now prove it in a paragraph.'],
        encouragement: 'Nice work.',
        degraded: false,
      },
    });

    const data = writingPracticeAttempt.create.mock.calls[0][0].data;
    expect(data.classAssignmentId).toBe('ca-1');
    expect(data.lessonSlug).toBe('topic-sentences');
    expect(data.promptId).toBe('topic-sentences-1');
    expect(data.exercise).toBe('Rewrite this announcement as a claim.');
    expect(data.response).toBe(
      'The cafeteria menu punishes the students who need lunch most.'
    );
    expect(data.status).toBe('strong');
    expect(data.feedbackJson.kind).toBe('composition');
    expect(data.feedbackJson.summary).toBe('A clear, arguable claim.');
  });
});
