import { describe, expect, test } from 'bun:test';
import {
  isSubmissionGradeReleasedToStudent,
  STUDENT_SUBMISSION_SUMMARY_ALLOWLIST,
  stripUnreleasedGradeFromStudentSubmissionPayload,
  stripUnreleasedGradeFromSubmissionSummary,
  stripUnreleasedGradeFromSubmissionSummaries,
  shouldHideUnreleasedGradeFromStudent,
  redactGradedAtFromStudentDocumentSubmissions,
} from './student-submission-grade-visibility.server';

describe('isSubmissionGradeReleasedToStudent', () => {
  test('is false until releasedAt is set', () => {
    expect(isSubmissionGradeReleasedToStudent({ releasedAt: null })).toBe(false);
    expect(
      isSubmissionGradeReleasedToStudent({
        releasedAt: '2026-08-01T00:00:00.000Z',
      })
    ).toBe(true);
  });
});

describe('shouldHideUnreleasedGradeFromStudent', () => {
  test('hides for student owners only', () => {
    expect(
      shouldHideUnreleasedGradeFromStudent({
        isOwner: true,
        isTeacher: false,
        isAdmin: false,
      })
    ).toBe(true);
    expect(
      shouldHideUnreleasedGradeFromStudent({
        isOwner: false,
        isTeacher: true,
        isAdmin: false,
      })
    ).toBe(false);
    expect(
      shouldHideUnreleasedGradeFromStudent({
        isOwner: true,
        isTeacher: true,
        isAdmin: false,
      })
    ).toBe(false);
  });
});

describe('stripUnreleasedGradeFromSubmissionSummary', () => {
  test('returns only allowlisted fields when unreleased', () => {
    const stripped = stripUnreleasedGradeFromSubmissionSummary({
      id: 'sub-1',
      title: 'Essay',
      releasedAt: null,
      submittedAt: '2026-08-01',
      numericPercentage: 80,
      overallScore: 85,
      letterGrade: 'B',
      score: '80% (B)',
      feedback: 'secret',
    });
    expect(Object.keys(stripped).sort()).toEqual(
      [...STUDENT_SUBMISSION_SUMMARY_ALLOWLIST].filter((key) =>
        ['id', 'title', 'submittedAt', 'releasedAt'].includes(key)
      ).sort()
    );
    expect(stripped).not.toHaveProperty('overallScore');
    expect(stripped).not.toHaveProperty('numericPercentage');
    expect(stripped).not.toHaveProperty('score');
    expect(JSON.stringify(stripped)).not.toContain('85');
  });

  test('leaves released summaries intact', () => {
    const input = {
      id: 'sub-1',
      releasedAt: new Date(),
      numericPercentage: 77,
      overallScore: 77,
      letterGrade: 'C+',
      score: '77% (C+)',
    };
    expect(stripUnreleasedGradeFromSubmissionSummary(input)).toEqual(input);
  });
});

describe('stripUnreleasedGradeFromStudentSubmissionPayload', () => {
  const gradedUnreleased = {
    id: 'sub-1',
    title: 'Essay',
    releasedAt: null,
    score: '80% (B)',
    feedback: 'Strong work.',
    rubricScores: { thesis: { score: 4, comment: 'Clear thesis.' } },
    overallScore: 18,
    overallComment: 'Keep revising evidence.',
    numericPercentage: 80,
    letterGrade: 'B',
    grammarIssues: { issues: [{ id: 'g1', excerpt: 'foo' }] },
    aiMeta: { model: 'test' },
    gradedAt: new Date('2026-08-02'),
    gradedByMembershipId: 'teacher-1',
    comments: [{ id: 'c1', content: 'Nice opening.' }],
    assistantSuggestion: { numericPercentage: 80, overallComment: 'AI said hi' },
    document: {
      submissions: [
        {
          id: 'sub-1',
          title: 'Essay',
          submittedAt: new Date(),
          releasedAt: null,
          numericPercentage: 80,
          overallScore: 85,
          letterGrade: 'B',
          score: '80% (B)',
        },
      ],
    },
  };

  test('strips all grade and feedback fields when unreleased', () => {
    const stripped = stripUnreleasedGradeFromStudentSubmissionPayload(
      gradedUnreleased
    );
    expect(stripped.score).toBeNull();
    expect(stripped.feedback).toBeNull();
    expect(stripped.rubricScores).toBeNull();
    expect(stripped.overallScore).toBeNull();
    expect(stripped.overallComment).toBeNull();
    expect(stripped.numericPercentage).toBeNull();
    expect(stripped.letterGrade).toBeNull();
    expect(stripped.grammarIssues).toBeNull();
    expect(stripped.aiMeta).toBeNull();
    expect(stripped.gradedAt).toBeNull();
    expect(stripped.gradedByMembershipId).toBeNull();
    expect(stripped.comments).toEqual([]);
    expect(stripped).not.toHaveProperty('assistantSuggestion');
    expect(stripped.document?.submissions?.[0]).not.toHaveProperty(
      'overallScore'
    );
    expect(stripped.document?.submissions?.[0]).not.toHaveProperty(
      'numericPercentage'
    );
    expect(JSON.stringify(stripped)).not.toContain('Strong work');
    expect(JSON.stringify(stripped)).not.toContain('Nice opening');
    expect(JSON.stringify(stripped)).not.toContain('Clear thesis');
  });

  test('returns released submissions unchanged', () => {
    const released = {
      ...gradedUnreleased,
      releasedAt: new Date('2026-08-03'),
    };
    expect(stripUnreleasedGradeFromStudentSubmissionPayload(released)).toEqual(
      released
    );
  });
});

describe('stripUnreleasedGradeFromSubmissionSummaries', () => {
  test('only strips unreleased rows in a mixed list', () => {
    const result = stripUnreleasedGradeFromSubmissionSummaries([
      {
        id: 'a',
        releasedAt: null,
        numericPercentage: 80,
        overallScore: 85,
        letterGrade: 'B',
        score: '80%',
      },
      {
        id: 'b',
        releasedAt: new Date(),
        numericPercentage: 90,
        overallScore: 90,
        letterGrade: 'A',
        score: '90%',
      },
    ]);
    expect(result[0]).toEqual({ id: 'a', releasedAt: null });
    expect(result[1].numericPercentage).toBe(90);
    expect(result[1].overallScore).toBe(90);
  });
});

describe('redactGradedAtFromStudentDocumentSubmissions', () => {
  test('removes gradedAt from each row', () => {
    const rows = redactGradedAtFromStudentDocumentSubmissions([
      {
        id: 's1',
        gradedAt: new Date(),
        releasedAt: null,
      },
    ]);
    expect(rows[0]).toEqual({ id: 's1', releasedAt: null });
  });
});
