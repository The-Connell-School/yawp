import { describe, expect, mock, test } from 'bun:test';
import {
  buildSubmissionActivityChanges,
  buildSubmissionBodyAuditMetadata,
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionAuditValuesEqual,
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

  test('fails closed when the emergency audit-write switch is disabled', async () => {
    const previous = process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
    process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = 'false';
    const create = mock();
    try {
      await expect(
        recordSubmissionActivity({ submissionActivity: { create } } as any, {
          submissionId: 'sub-1',
          organizationId: 'org-1',
          actorMembershipId: 'teacher-1',
          eventType: 'submission.grade_updated',
          source: 'test',
          occurredAfterRelease: true,
          changes: { score: { before: '77', after: '92' } },
        })
      ).rejects.toThrow(
        'Submission activity recording is temporarily unavailable'
      );
      expect(create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
      } else {
        process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = previous;
      }
    }
  });

  test('does not treat JSON object key order as a change', () => {
    expect(
      buildSubmissionActivityChanges({
        before: { rubricScores: { thesis: 4, evidence: 3 } },
        after: { rubricScores: { evidence: 3, thesis: 4 } },
      })
    ).toEqual({});
  });

  test('does not attribute a cross-tenant platform admin membership', () => {
    expect(
      resolveSubmissionActivityActorMembershipId({
        actorMembershipId: 'admin-membership',
        actorOrganizationId: 'admin-org',
        submissionOrganizationId: 'student-org',
      })
    ).toBeNull();
    expect(
      resolveSubmissionActivityActorMembershipId({
        actorMembershipId: 'teacher-membership',
        actorOrganizationId: 'student-org',
        submissionOrganizationId: 'student-org',
      })
    ).toBe('teacher-membership');
  });

  test('snapshots a human actor even when no tenant membership can be linked', async () => {
    const create = mock((args: unknown) => args);
    const findUnique = mock(() => ({
      name: 'Platform Admin',
      email: 'admin@example.test',
    }));
    await recordSubmissionActivity(
      { user: { findUnique }, submissionActivity: { create } } as any,
      {
        submissionId: 'sub-1',
        organizationId: 'student-org',
        actorMembershipId: null,
        actorUserId: 'admin-user',
        eventType: 'submission.grade_updated',
        source: 'test',
        occurredAfterRelease: true,
        changes: { score: { before: '77', after: '92' } },
      }
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorMembershipId: null,
        actorType: 'human',
        actorName: 'Platform Admin',
        actorEmail: 'admin@example.test',
      }),
    });
  });

  test('exports the same canonical equality used by mutation routes', () => {
    expect(
      submissionAuditValuesEqual(
        { b: 2, a: [{ y: true, x: false }] },
        { a: [{ x: false, y: true }], b: 2 }
      )
    ).toBe(true);
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
