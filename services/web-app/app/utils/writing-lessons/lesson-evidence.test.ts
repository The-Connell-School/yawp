import { describe, expect, test } from 'bun:test';

import type { ActAttemptRecord } from './act-practice.shared';
import { summarizeLessonEvidence } from './lesson-evidence';

const SLUG = 'fixing-comma-splices';

function actRecord(
  overrides: Partial<ActAttemptRecord> & { selectedChoiceIndex: number }
): ActAttemptRecord {
  const choices = overrides.choices ?? [
    'week, students',
    'week; students',
    'week students',
    'week, and, students',
  ];
  const correctChoiceIndex = overrides.correctChoiceIndex ?? 1;
  return {
    kind: 'act',
    sentence: overrides.sentence ?? 'The test was last week, students passed.',
    underline: overrides.underline ?? 'week, students',
    choices,
    correctChoiceIndex,
    correct: overrides.selectedChoiceIndex === correctChoiceIndex,
    explanation: overrides.explanation ?? 'A semicolon joins two clauses.',
    ...overrides,
  };
}

function attempt(params: {
  membershipId: string;
  promptId: string;
  record: unknown;
  status?: string;
  lessonSlug?: string;
  createdAt?: Date;
}) {
  return {
    membershipId: params.membershipId,
    lessonSlug: params.lessonSlug ?? SLUG,
    promptId: params.promptId,
    status: params.status ?? 'strong',
    record: params.record,
    createdAt: params.createdAt ?? new Date('2026-03-01T12:00:00.000Z'),
  };
}

function deployment(
  overrides: Partial<{
    classAssignmentId: string;
    classLabel: string;
    assignmentTitle: string;
    dueAt: Date | null;
    studentIds: string[];
    attempts: ReturnType<typeof attempt>[];
  }> = {}
) {
  return {
    classAssignmentId: overrides.classAssignmentId ?? 'ca-1',
    classLabel: overrides.classLabel ?? 'English 9 · Period 2',
    assignmentTitle: overrides.assignmentTitle ?? 'Comma splices practice',
    dueAt:
      overrides.dueAt === undefined ? new Date('2026-03-05') : overrides.dueAt,
    studentIds: overrides.studentIds ?? ['s1', 's2', 's3'],
    attempts: overrides.attempts ?? [],
  };
}

describe('summarizeLessonEvidence', () => {
  test('reports nothing to show when the skill has never been assigned', () => {
    const evidence = summarizeLessonEvidence({
      lessonSlug: SLUG,
      deployments: [],
    });

    expect(evidence.classes).toEqual([]);
    expect(evidence.studentsPracticed).toBe(0);
    expect(evidence.answeredCount).toBe(0);
    expect(evidence.misses).toEqual([]);
  });

  test('counts who practiced the skill and how they did, per class', () => {
    const evidence = summarizeLessonEvidence({
      lessonSlug: SLUG,
      deployments: [
        deployment({
          attempts: [
            // s1 gets it right, s2 picks the comma splice back.
            attempt({
              membershipId: 's1',
              promptId: 'p1',
              record: actRecord({ selectedChoiceIndex: 1 }),
            }),
            attempt({
              membershipId: 's2',
              promptId: 'p2',
              record: actRecord({ selectedChoiceIndex: 0 }),
              status: 'needs_revision',
            }),
          ],
        }),
      ],
    });

    const [klass] = evidence.classes;
    expect(klass.classLabel).toBe('English 9 · Period 2');
    expect(klass.studentCount).toBe(3);
    // s3 never started.
    expect(klass.practicedCount).toBe(2);
    expect(klass.answeredCount).toBe(2);
    expect(klass.correctCount).toBe(1);

    expect(evidence.studentsPracticed).toBe(2);
    expect(evidence.answeredCount).toBe(2);
    expect(evidence.correctCount).toBe(1);
  });

  test('only counts attempts on this skill, not the rest of a mixed set', () => {
    const evidence = summarizeLessonEvidence({
      lessonSlug: SLUG,
      deployments: [
        deployment({
          attempts: [
            attempt({
              membershipId: 's1',
              promptId: 'p1',
              record: actRecord({ selectedChoiceIndex: 1 }),
            }),
            attempt({
              membershipId: 's2',
              promptId: 'p2',
              lessonSlug: 'passive-voice',
              record: actRecord({ selectedChoiceIndex: 0 }),
            }),
          ],
        }),
      ],
    });

    expect(evidence.answeredCount).toBe(1);
    expect(evidence.studentsPracticed).toBe(1);
    expect(evidence.classes[0].practicedCount).toBe(1);
  });

  test('collapses a student’s revisions of one problem into a single answer', () => {
    const evidence = summarizeLessonEvidence({
      lessonSlug: SLUG,
      deployments: [
        deployment({
          attempts: [
            attempt({
              membershipId: 's1',
              promptId: 'p1',
              record: actRecord({ selectedChoiceIndex: 0 }),
              createdAt: new Date('2026-03-01T12:00:00.000Z'),
            }),
            attempt({
              membershipId: 's1',
              promptId: 'p1',
              record: actRecord({ selectedChoiceIndex: 1 }),
              createdAt: new Date('2026-03-01T12:05:00.000Z'),
            }),
          ],
        }),
      ],
    });

    expect(evidence.answeredCount).toBe(1);
    // The latest attempt is the one that stands.
    expect(evidence.correctCount).toBe(1);
  });

  test('surfaces the questions students actually miss, worst first', () => {
    const easy = 'The bell rang, we left.';
    const hard = 'The test was last week, students passed.';
    const evidence = summarizeLessonEvidence({
      lessonSlug: SLUG,
      deployments: [
        deployment({
          studentIds: ['s1', 's2', 's3'],
          attempts: [
            // Two students miss the hard one the same way; one gets it.
            attempt({
              membershipId: 's1',
              promptId: 'p1',
              record: actRecord({ sentence: hard, selectedChoiceIndex: 0 }),
            }),
            attempt({
              membershipId: 's2',
              promptId: 'p2',
              record: actRecord({ sentence: hard, selectedChoiceIndex: 0 }),
            }),
            attempt({
              membershipId: 's3',
              promptId: 'p3',
              record: actRecord({ sentence: hard, selectedChoiceIndex: 1 }),
            }),
            // One student misses the easy one.
            attempt({
              membershipId: 's1',
              promptId: 'p4',
              record: actRecord({ sentence: easy, selectedChoiceIndex: 2 }),
            }),
          ],
        }),
      ],
    });

    expect(evidence.misses).toHaveLength(2);
    const [worst, next] = evidence.misses;

    expect(worst.sentence).toBe(hard);
    expect(worst.answeredCount).toBe(3);
    expect(worst.wrongCount).toBe(2);
    // What they picked instead — the line a teacher can put on the board.
    expect(worst.topWrongChoice).toBe('week, students');
    expect(worst.correctChoice).toBe('week; students');
    expect(worst.explanation).toBe('A semicolon joins two clauses.');

    expect(next.sentence).toBe(easy);
    expect(next.wrongCount).toBe(1);
  });

  test('groups the same question across classes and sets, not by prompt id', () => {
    // AI-generated sets give every student their own prompt ids, so the
    // question text is what identifies "the same problem".
    const sentence = 'The test was last week, students passed.';
    const evidence = summarizeLessonEvidence({
      lessonSlug: SLUG,
      deployments: [
        deployment({
          classAssignmentId: 'ca-1',
          attempts: [
            attempt({
              membershipId: 's1',
              promptId: 'gen-abc',
              record: actRecord({ sentence, selectedChoiceIndex: 0 }),
            }),
          ],
        }),
        deployment({
          classAssignmentId: 'ca-2',
          classLabel: 'English 9 · Period 4',
          studentIds: ['s4'],
          attempts: [
            attempt({
              membershipId: 's4',
              promptId: 'gen-xyz',
              record: actRecord({ sentence, selectedChoiceIndex: 0 }),
            }),
          ],
        }),
      ],
    });

    expect(evidence.classes).toHaveLength(2);
    expect(evidence.misses).toHaveLength(1);
    expect(evidence.misses[0].wrongCount).toBe(2);
    expect(evidence.misses[0].answeredCount).toBe(2);
  });

  test('caps the miss list so the panel stays readable', () => {
    const attempts = ['a', 'b', 'c', 'd', 'e'].map((letter, index) =>
      attempt({
        membershipId: `s${index}`,
        promptId: `p${index}`,
        record: actRecord({
          sentence: `Sentence ${letter}, it runs on.`,
          selectedChoiceIndex: 0,
        }),
      })
    );

    const evidence = summarizeLessonEvidence({
      lessonSlug: SLUG,
      deployments: [deployment({ attempts })],
    });

    expect(evidence.misses).toHaveLength(3);
  });

  test('reads composition practice as mastery and revision, not right or wrong', () => {
    const compositionRecord = (status: string) => ({
      kind: 'composition' as const,
      exercise: 'Turn this announcement into a claim.',
      instruction: 'Write a topic sentence.',
      response: 'The cafeteria menu punishes the students who need lunch.',
      status,
      summary: 'A summary.',
      strengths: [],
      focus: [],
      encouragement: 'Keep going.',
      degraded: false,
    });

    const evidence = summarizeLessonEvidence({
      lessonSlug: 'topic-sentences',
      deployments: [
        deployment({
          attempts: [
            attempt({
              membershipId: 's1',
              promptId: 'p1',
              lessonSlug: 'topic-sentences',
              status: 'strong',
              record: compositionRecord('strong'),
            }),
            attempt({
              membershipId: 's2',
              promptId: 'p2',
              lessonSlug: 'topic-sentences',
              status: 'developing',
              record: compositionRecord('developing'),
            }),
          ],
        }),
      ],
    });

    expect(evidence.masteredCount).toBe(1);
    expect(evidence.revisingCount).toBe(1);
    // Constructed response has no multiple-choice tally to report.
    expect(evidence.answeredCount).toBe(0);
    expect(evidence.misses).toEqual([]);
    expect(evidence.classes[0].masteredCount).toBe(1);
    expect(evidence.classes[0].revisingCount).toBe(1);
  });

  test('ignores a malformed attempt record instead of throwing', () => {
    const evidence = summarizeLessonEvidence({
      lessonSlug: SLUG,
      deployments: [
        deployment({
          attempts: [
            attempt({ membershipId: 's1', promptId: 'p1', record: null }),
            attempt({
              membershipId: 's2',
              promptId: 'p2',
              record: { kind: 'act', sentence: 'Broken.' },
            }),
            attempt({
              membershipId: 's3',
              promptId: 'p3',
              record: actRecord({ selectedChoiceIndex: 1 }),
            }),
          ],
        }),
      ],
    });

    expect(evidence.answeredCount).toBe(1);
    expect(evidence.correctCount).toBe(1);
    // A student whose only attempt is unreadable still counts as having practiced.
    expect(evidence.studentsPracticed).toBe(3);
  });
});
