import { describe, expect, mock, test } from 'bun:test';
import { lockSubmissionCommentAccess } from './submission-comment-access.server';

function anchor(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: 'sub-1',
    classAssignmentId: 'class-assignment-1',
    documentMembershipId: 'student-1',
    documentOwnerUserId: 'student-user-1',
    documentOrganizationId: 'org-1',
    actorOrganizationId: 'org-1',
    actorIsActive: true,
    actorIsAdmin: false,
    ...overrides,
  };
}

describe('lockSubmissionCommentAccess', () => {
  test('locks and accepts assignment-specific teacher access', async () => {
    const queryRaw = mock()
      .mockResolvedValueOnce([anchor()])
      .mockResolvedValueOnce([{ id: 'class-assignment-1' }]);

    const allowed = await lockSubmissionCommentAccess(
      { $queryRaw: queryRaw } as any,
      {
        submissionId: 'sub-1',
        actorMembershipId: 'teacher-1',
        actorUserId: 'teacher-user-1',
      }
    );

    expect(allowed).toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  test('accepts assignment-specific teacher access when the artifact has no owner', async () => {
    const queryRaw = mock()
      .mockResolvedValueOnce([
        anchor({
          documentMembershipId: null,
          documentOwnerUserId: null,
        }),
      ])
      .mockResolvedValueOnce([{ id: 'class-assignment-1' }]);

    await expect(
      lockSubmissionCommentAccess({ $queryRaw: queryRaw } as any, {
        submissionId: 'sub-1',
        actorMembershipId: 'teacher-1',
        actorUserId: 'teacher-user-1',
      })
    ).resolves.toBe(true);
  });

  test('locks and accepts legacy class teacher access', async () => {
    const queryRaw = mock()
      .mockResolvedValueOnce([anchor({ classAssignmentId: null })])
      .mockResolvedValueOnce([{ id: 'class-legacy' }]);

    const allowed = await lockSubmissionCommentAccess(
      { $queryRaw: queryRaw } as any,
      {
        submissionId: 'sub-1',
        actorMembershipId: 'teacher-1',
        actorUserId: 'teacher-user-1',
      }
    );

    expect(allowed).toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  test('rejects revoked, inactive, cross-tenant, and own-document access', async () => {
    for (const deniedAnchor of [
      anchor({ actorIsActive: false }),
      anchor({ documentOrganizationId: 'org-2' }),
      anchor({ documentOwnerUserId: 'teacher-user-1' }),
    ]) {
      const queryRaw = mock().mockResolvedValueOnce([deniedAnchor]);
      expect(
        await lockSubmissionCommentAccess({ $queryRaw: queryRaw } as any, {
          submissionId: 'sub-1',
          actorMembershipId: 'teacher-1',
          actorUserId: 'teacher-user-1',
        })
      ).toBe(false);
      expect(queryRaw).toHaveBeenCalledTimes(1);
    }

    const revokedRelationship = mock()
      .mockResolvedValueOnce([anchor()])
      .mockResolvedValueOnce([]);
    expect(
      await lockSubmissionCommentAccess(
        { $queryRaw: revokedRelationship } as any,
        {
          submissionId: 'sub-1',
          actorMembershipId: 'teacher-1',
          actorUserId: 'teacher-user-1',
        }
      )
    ).toBe(false);
  });

  test('preserves active platform-admin access but never own-document access', async () => {
    const crossTenantAdmin = mock().mockResolvedValueOnce([
      anchor({
        actorIsAdmin: true,
        actorOrganizationId: 'org-admin',
        documentOrganizationId: 'org-student',
      }),
    ]);
    expect(
      await lockSubmissionCommentAccess(
        { $queryRaw: crossTenantAdmin } as any,
        {
          submissionId: 'sub-1',
          actorMembershipId: 'admin-1',
          actorUserId: 'admin-user-1',
        }
      )
    ).toBe(true);

    const ownDocumentAdmin = mock().mockResolvedValueOnce([
      anchor({
        actorIsAdmin: true,
        documentOwnerUserId: 'admin-user-1',
      }),
    ]);
    expect(
      await lockSubmissionCommentAccess(
        { $queryRaw: ownDocumentAdmin } as any,
        {
          submissionId: 'sub-1',
          actorMembershipId: 'admin-1',
          actorUserId: 'admin-user-1',
        }
      )
    ).toBe(false);
  });
});
