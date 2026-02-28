import { describe, expect, test } from 'bun:test';
import { buildPersistedGradeSignature } from './persisted-grade-signature';

describe('buildPersistedGradeSignature', () => {
  test('changes when a grammar issue is removed', () => {
    const rubricScores = {
      thesis_and_content: { score: 3, comment: 'Clear thesis.' },
      organization_and_structure: { score: 3, comment: 'Good flow.' },
      evidence_and_support: { score: 3, comment: 'Relevant evidence.' },
      voice_and_style: { score: 3, comment: 'Consistent voice.' },
      grammar_and_mechanics: { score: 3, comment: 'Mostly clean.' },
    };

    const withTwoIssues = buildPersistedGradeSignature({
      overallComment: 'Solid draft.',
      numericPercentage: 86,
      rubricScores,
      grammarIssues: [
        {
          id: 'issue-1',
          excerpt: 'This are',
          occurrence: 1,
          kind: 'error',
          message: 'Subject-verb agreement error.',
        },
        {
          id: 'issue-2',
          excerpt: 'very really good',
          occurrence: 1,
          kind: 'style',
          message: 'Wordy phrasing.',
        },
      ],
    });

    const withOneIssue = buildPersistedGradeSignature({
      overallComment: 'Solid draft.',
      numericPercentage: 86,
      rubricScores,
      grammarIssues: [
        {
          id: 'issue-2',
          excerpt: 'very really good',
          occurrence: 1,
          kind: 'style',
          message: 'Wordy phrasing.',
        },
      ],
    });

    expect(withOneIssue).not.toBe(withTwoIssues);
  });
});
