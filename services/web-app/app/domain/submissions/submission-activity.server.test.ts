import { describe, expect, mock, test } from 'bun:test';
import {
  buildSubmissionActivityChanges,
  buildSubmissionBodyAuditMetadata,
  recordSubmissionActivity,
} from './submission-activity.server';

describe('submission activity', () => {
  test('records exact allowlisted before and after values', () => {
    expect(
      buildSubmissionActivityChanges({
        before: {
          score: '85% B',
          feedback: 'Before',
          aiMeta: { secret: 'x' },
        },
        after: {
          score: '92% A-',
          feedback: 'After',
          aiMeta: { secret: 'y' },
        },
      })
    ).toEqual({
      score: { before: '85% B', after: '92% A-' },
      feedback: { before: 'Before', after: 'After' },
    });
  });

  test('suppresses no-op writes', async () => {
    const create = mock();
    const result = await recordSubmissionActivity(
      { submissionActivity: { create } } as any,
      {
        submissionId: 'sub-1',
        organizationId: 'org-1',
        actorMembershipId: 'teacher-1',
        eventType: 'submission.grade_updated',
        source: 'update-submission',
        occurredAfterRelease: true,
        changes: {},
      }
    );

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  test('does not treat JSON object key order as a change', () => {
    expect(
      buildSubmissionActivityChanges({
        before: { rubricScores: { thesis: 4, evidence: 3 } },
        after: { rubricScores: { evidence: 3, thesis: 4 } },
      })
    ).toEqual({});
  });

  test('stores only hashes and lengths for submission bodies', () => {
    const metadata = buildSubmissionBodyAuditMetadata({
      text: 'private essay body',
      html: '<p>private essay body</p>',
    });

    expect(metadata.text.length).toBe(18);
    expect(metadata.html.length).toBe(25);
    expect(metadata.text.sha256).toHaveLength(64);
    expect(JSON.stringify(metadata)).not.toContain('private essay body');
  });
});
