import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  type ScopedDocument,
} from '~/utils/testing/where-eval';

const prisma = {
  document: { findFirst: mock() },
  orgMembership: { findFirst: mock(), findMany: mock() },
  documentCollaborator: { upsert: mock(), updateMany: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  inviteCollaborator,
  removeCollaborator,
  listInvitableClassmates,
  MAX_COLLABORATORS,
} = await import('./document-collaborators.server');

const OWNER = 'profile-owner';
const CLASSMATE = 'profile-classmate';
const COLLABORATOR = 'profile-collaborator';
const OUTSIDER = 'profile-outsider';
const TEACHER = 'profile-teacher';
const ORG = 'org-1';
const CLASS_ASSIGNMENT = 'class-assignment-1';

/**
 * The owner's document. Fixture carries a live collaborator so every predicate is
 * evaluated against a document that IS shared — a predicate that leaks sideways shows up
 * here and would not on an unshared fixture.
 */
const DOC: ScopedDocument = {
  id: 'doc-1',
  membershipId: OWNER,
  teacherProfileIds: [TEACHER],
  classAssignmentId: CLASS_ASSIGNMENT,
  collaboratorMembershipIds: [COLLABORATOR],
  enrolledStudentIds: [OWNER, COLLABORATOR, CLASSMATE],
};

/**
 * Stands in for the database. The row comes back only if the query's own where clause
 * selects it — which is what makes these tests fail against an unguarded implementation
 * instead of merely asserting that some object was passed.
 */
function documentFindFirst(fixture: ScopedDocument, liveCollaborators = 1) {
  return async ({ where }: any) => {
    if (!matchesDocumentWhere(where, fixture)) return null;
    // The self-removal branch filters on the collaborators relation rather than on a
    // membership id; matchesDocumentWhere handles that shape too.
    return {
      id: fixture.id,
      membershipId: fixture.membershipId,
      classAssignmentId: fixture.classAssignmentId,
      collaborators: fixture.collaboratorMembershipIds.map((membershipId) => ({
        membershipId,
      })),
      _count: { collaborators: liveCollaborators },
    };
  };
}

const inviteeRow = { id: CLASSMATE };

function upsertResult(membershipId: string) {
  return {
    membershipId,
    invitedByMembershipId: OWNER,
    createdAt: new Date('2026-08-08T00:00:00Z'),
    membership: { user: { name: 'A Classmate', email: 'c@example.com' } },
  };
}

describe('inviteCollaborator', () => {
  beforeEach(() => {
    prisma.document.findFirst.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.documentCollaborator.upsert.mockReset();
    prisma.documentCollaborator.updateMany.mockReset();

    prisma.document.findFirst.mockImplementation(documentFindFirst(DOC));
    prisma.orgMembership.findFirst.mockResolvedValue(inviteeRow);
    prisma.documentCollaborator.upsert.mockResolvedValue(
      upsertResult(CLASSMATE)
    );
  });

  test('the owner can invite a classmate', async () => {
    const result = await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    expect(result).toEqual({
      ok: true,
      collaborator: {
        membershipId: CLASSMATE,
        name: 'A Classmate',
        email: 'c@example.com',
        invitedByMembershipId: OWNER,
        createdAt: new Date('2026-08-08T00:00:00Z'),
      },
    });
    expect(prisma.documentCollaborator.upsert).toHaveBeenCalledTimes(1);
  });

  test('a non-owner cannot invite — the document resolves under the OWNER rule', async () => {
    const result = await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OUTSIDER,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    expect(result).toEqual({ ok: false, reason: 'document_not_found' });
    expect(prisma.documentCollaborator.upsert).not.toHaveBeenCalled();
  });

  test('a COLLABORATOR cannot invite — no chaining, no transitive fan-out', async () => {
    const result = await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: COLLABORATOR,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    expect(result).toEqual({ ok: false, reason: 'document_not_found' });
    expect(prisma.documentCollaborator.upsert).not.toHaveBeenCalled();
  });

  test("a TEACHER cannot invite onto a student's document", async () => {
    // The invite resolves under documentOwnerWhere, not documentReadWhere, so the
    // teacher arm that lets a teacher read this document does not reach this route.
    const result = await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: TEACHER,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    expect(result).toEqual({ ok: false, reason: 'document_not_found' });
    expect(prisma.documentCollaborator.upsert).not.toHaveBeenCalled();
  });

  test('the owner cannot invite themselves', async () => {
    const result = await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
      inviteeMembershipId: OWNER,
    });

    expect(result).toEqual({ ok: false, reason: 'cannot_invite_self' });
    expect(prisma.documentCollaborator.upsert).not.toHaveBeenCalled();
  });

  test('cannot invite onto a document with no class assignment', async () => {
    prisma.document.findFirst.mockImplementation(
      documentFindFirst({ ...DOC, classAssignmentId: null })
    );

    const result = await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    expect(result).toEqual({ ok: false, reason: 'not_a_class_assignment' });
    expect(prisma.documentCollaborator.upsert).not.toHaveBeenCalled();
  });

  test('the invitee lookup pins organization, role, activity and class assignment', async () => {
    await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    const where = prisma.orgMembership.findFirst.mock.calls[0][0].where;

    // Cross-organization invite: organizationId comes from the session, never the body.
    expect(where.organizationId).toBe(ORG);
    // Role escalation: cannot pull a teacher or an admin onto the document.
    expect(where.role).toBe('STUDENT');
    // Deactivated accounts.
    expect(where.isActive).toBe(true);
    // Self-invite, belt and braces alongside the explicit check above.
    expect(where.NOT).toEqual({ id: OWNER });
    // Non-classmate: pinned to THIS class assignment, which is unique on
    // (assignmentId, classId) -- so this is one section, not "anyone doing this
    // assignment anywhere". That is also what stops a share dragging in a second teacher.
    expect(where.classesAsStudent).toEqual({
      some: { classAssignments: { some: { id: CLASS_ASSIGNMENT } } },
    });
    // And the id actually requested.
    expect(where.id).toBe(CLASSMATE);
  });

  test('a non-classmate is refused, with the same answer a nonexistent id gets', async () => {
    // The predicate above did not select anyone.
    prisma.orgMembership.findFirst.mockResolvedValue(null);

    const result = await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
      inviteeMembershipId: OUTSIDER,
    });

    expect(result).toEqual({ ok: false, reason: 'not_a_classmate' });
    expect(prisma.documentCollaborator.upsert).not.toHaveBeenCalled();
  });

  test('the collaborator limit is enforced before any write', async () => {
    prisma.document.findFirst.mockImplementation(
      documentFindFirst(DOC, MAX_COLLABORATORS)
    );

    const result = await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    expect(result).toEqual({ ok: false, reason: 'collaborator_limit' });
    expect(prisma.documentCollaborator.upsert).not.toHaveBeenCalled();
  });

  test('re-inviting a revoked collaborator clears revokedAt rather than duplicating', async () => {
    await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    const call = prisma.documentCollaborator.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      documentId_membershipId: {
        documentId: 'doc-1',
        membershipId: CLASSMATE,
      },
    });
    expect(call.update).toEqual({
      revokedAt: null,
      invitedByMembershipId: OWNER,
    });
  });

  test('a deleted or archived document cannot be shared', async () => {
    await inviteCollaborator({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
      inviteeMembershipId: CLASSMATE,
    });

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.archivedAt).toBeNull();
  });
});

describe('removeCollaborator', () => {
  beforeEach(() => {
    prisma.document.findFirst.mockReset();
    prisma.documentCollaborator.updateMany.mockReset();

    prisma.document.findFirst.mockImplementation(documentFindFirst(DOC));
    prisma.documentCollaborator.updateMany.mockResolvedValue({ count: 1 });
  });

  test('the owner can remove a collaborator, and access ends immediately', async () => {
    const result = await removeCollaborator({
      documentId: 'doc-1',
      actorProfileId: OWNER,
      targetMembershipId: COLLABORATOR,
    });

    expect(result).toEqual({ ok: true });
    const call = prisma.documentCollaborator.updateMany.mock.calls[0][0];
    // revokedAt: null in the predicate makes a double-revoke a no-op rather than
    // silently resetting the timestamp; the read predicate filters the same field, so
    // there is no cache to invalidate and no session to expire.
    expect(call.where).toEqual({
      documentId: 'doc-1',
      membershipId: COLLABORATOR,
      revokedAt: null,
    });
    expect(call.data.revokedAt).toBeInstanceOf(Date);
  });

  test('a collaborator can remove THEMSELVES', async () => {
    const result = await removeCollaborator({
      documentId: 'doc-1',
      actorProfileId: COLLABORATOR,
      targetMembershipId: COLLABORATOR,
    });

    expect(result).toEqual({ ok: true });
  });

  test('a collaborator cannot remove a DIFFERENT collaborator', async () => {
    // Not the owner, and not self -- so the lookup runs the owner predicate and
    // resolves nothing.
    const result = await removeCollaborator({
      documentId: 'doc-1',
      actorProfileId: COLLABORATOR,
      targetMembershipId: 'profile-someone-else',
    });

    expect(result).toEqual({ ok: false, reason: 'document_not_found' });
    expect(prisma.documentCollaborator.updateMany).not.toHaveBeenCalled();
  });

  test('a stranger cannot remove anyone', async () => {
    const result = await removeCollaborator({
      documentId: 'doc-1',
      actorProfileId: OUTSIDER,
      targetMembershipId: COLLABORATOR,
    });

    expect(result).toEqual({ ok: false, reason: 'document_not_found' });
    expect(prisma.documentCollaborator.updateMany).not.toHaveBeenCalled();
  });

  test('a stranger cannot self-remove their way in either', async () => {
    const result = await removeCollaborator({
      documentId: 'doc-1',
      actorProfileId: OUTSIDER,
      targetMembershipId: OUTSIDER,
    });

    expect(result).toEqual({ ok: false, reason: 'document_not_found' });
    expect(prisma.documentCollaborator.updateMany).not.toHaveBeenCalled();
  });

  test('a teacher cannot remove a collaborator — grouping is student-owned in v1', async () => {
    const result = await removeCollaborator({
      documentId: 'doc-1',
      actorProfileId: TEACHER,
      targetMembershipId: COLLABORATOR,
    });

    expect(result).toEqual({ ok: false, reason: 'document_not_found' });
    expect(prisma.documentCollaborator.updateMany).not.toHaveBeenCalled();
  });

  test('removing someone who is not on the document reports it', async () => {
    prisma.documentCollaborator.updateMany.mockResolvedValue({ count: 0 });

    const result = await removeCollaborator({
      documentId: 'doc-1',
      actorProfileId: OWNER,
      targetMembershipId: 'profile-nobody',
    });

    expect(result).toEqual({ ok: false, reason: 'not_a_collaborator' });
  });
});

describe('listInvitableClassmates', () => {
  beforeEach(() => {
    prisma.document.findFirst.mockReset();
    prisma.orgMembership.findMany.mockReset();

    prisma.document.findFirst.mockImplementation(documentFindFirst(DOC));
    prisma.orgMembership.findMany.mockResolvedValue([
      { id: CLASSMATE, user: { name: 'A Classmate', email: 'c@example.com' } },
    ]);
  });

  test('the owner gets the class roster, minus themselves and existing collaborators', async () => {
    const result = await listInvitableClassmates({
      documentId: 'doc-1',
      ownerProfileId: OWNER,
      organizationId: ORG,
    });

    expect(result).toEqual([
      { membershipId: CLASSMATE, name: 'A Classmate', email: 'c@example.com' },
    ]);

    const where = prisma.orgMembership.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.role).toBe('STUDENT');
    expect(where.isActive).toBe(true);
    expect(where.id).toEqual({ notIn: [OWNER, COLLABORATOR] });
    expect(where.classesAsStudent).toEqual({
      some: { classAssignments: { some: { id: CLASS_ASSIGNMENT } } },
    });
  });

  test('a non-owner cannot use the picker to enumerate a roster', async () => {
    const result = await listInvitableClassmates({
      documentId: 'doc-1',
      ownerProfileId: OUTSIDER,
      organizationId: ORG,
    });

    expect(result).toBeNull();
    expect(prisma.orgMembership.findMany).not.toHaveBeenCalled();
  });

  test('a collaborator cannot use the picker either', async () => {
    const result = await listInvitableClassmates({
      documentId: 'doc-1',
      ownerProfileId: COLLABORATOR,
      organizationId: ORG,
    });

    expect(result).toBeNull();
    expect(prisma.orgMembership.findMany).not.toHaveBeenCalled();
  });
});
