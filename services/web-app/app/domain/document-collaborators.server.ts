import { prisma } from '~/utils/db.server';
import {
  documentOwnerWhere,
  documentReadWhere,
} from '~/utils/document-access.server';

/**
 * Inviting and removing document collaborators — group work on one document.
 *
 * Every authorization decision in here is a Prisma predicate. Nothing in this file
 * fetches a row and then decides whether the caller should have had it: an unauthorized
 * caller never holds the row. That is not stylistic. The audit that closed fourteen
 * defects in this codebase found that every one of them was either treating
 * authentication as authorization, or checking access after the fetch.
 *
 * The design in one line: only the document OWNER may invite, only students already
 * enrolled in the same ClassAssignment, only on class-assignment documents, and holding
 * a collaborator row is never by itself sufficient — the read predicate re-derives
 * enrollment on every query.
 */

/**
 * Maximum LIVE collaborators on one document, i.e. a group of MAX + 1 including the
 * owner. This is a UX guard, not a security boundary: the count and the insert are not
 * in one transaction, so concurrent invites can overshoot by one or two. That is
 * acceptable for a class-size limit and is called out rather than papered over with a
 * transaction that would imply a guarantee this does not make.
 */
export const MAX_COLLABORATORS = 4;

export type InviteFailure =
  /** No such document, or the caller is not its owner, or it is deleted/archived. */
  | 'document_not_found'
  /** The document has no ClassAssignment, so there is no roster to invite from. */
  | 'not_a_class_assignment'
  /** Not an active student on this class assignment, in this organization. */
  | 'not_a_classmate'
  /** The owner tried to invite themselves. */
  | 'cannot_invite_self'
  | 'collaborator_limit';

export type InviteResult =
  | { ok: true; collaborator: CollaboratorSummary }
  | { ok: false; reason: InviteFailure };

export type RemoveFailure = 'document_not_found' | 'not_a_collaborator';

export type RemoveResult = { ok: true } | { ok: false; reason: RemoveFailure };

export type CollaboratorSummary = {
  membershipId: string;
  name: string | null;
  email: string | null;
  invitedByMembershipId: string;
  createdAt: Date;
};

export type InvitableClassmate = {
  membershipId: string;
  name: string | null;
  email: string | null;
};

const collaboratorSelect = {
  membershipId: true,
  invitedByMembershipId: true,
  createdAt: true,
  membership: {
    select: { user: { select: { name: true, email: true } } },
  },
} as const;

function toSummary(row: {
  membershipId: string;
  invitedByMembershipId: string;
  createdAt: Date;
  membership: { user: { name: string | null; email: string | null } };
}): CollaboratorSummary {
  return {
    membershipId: row.membershipId,
    name: row.membership.user.name,
    email: row.membership.user.email,
    invitedByMembershipId: row.invitedByMembershipId,
    createdAt: row.createdAt,
  };
}

/**
 * Live collaborators on a document, for anyone who may read that document — the owner,
 * the collaborators themselves, the owner's teachers, and platform admins.
 *
 * Returns `null` when the caller may not read the document, so the caller renders a
 * not-found rather than an empty group.
 */
export async function listCollaborators({
  documentId,
  profileId,
  isAdmin,
}: {
  documentId: string;
  profileId: string;
  isAdmin?: boolean | null;
}): Promise<CollaboratorSummary[] | null> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      ...documentReadWhere({ profileId, isAdmin }),
    },
    select: {
      collaborators: {
        where: { revokedAt: null },
        orderBy: { createdAt: 'asc' },
        select: collaboratorSelect,
      },
    },
  });

  if (!document) return null;

  return document.collaborators.map(toSummary);
}

/**
 * The classmates the OWNER may invite: active students on this document's class
 * assignment, excluding the owner and anyone already a live collaborator.
 *
 * This exists to populate the picker and is deliberately scoped by the same conditions
 * the invite itself re-checks. The picker is convenience; `inviteCollaborator` never
 * trusts it and re-validates the target independently. Returns `null` when the caller
 * does not own the document, so the picker cannot be used to enumerate rosters.
 */
export async function listInvitableClassmates({
  documentId,
  ownerProfileId,
  organizationId,
}: {
  documentId: string;
  ownerProfileId: string;
  organizationId: string;
}): Promise<InvitableClassmate[] | null> {
  const document = await prisma.document.findFirst({
    // documentOwnerWhere, never documentReadWhere and never admin-bypassed: sharing is
    // the owner's decision to make about their own work.
    where: {
      id: documentId,
      deletedAt: null,
      archivedAt: null,
      ...documentOwnerWhere({ profileId: ownerProfileId }),
    },
    select: {
      classAssignmentId: true,
      collaborators: {
        where: { revokedAt: null },
        select: { membershipId: true },
      },
    },
  });

  if (!document?.classAssignmentId) return null;

  const alreadyInvited = document.collaborators.map((c) => c.membershipId);

  const classmates = await prisma.orgMembership.findMany({
    where: {
      organizationId,
      isActive: true,
      role: 'STUDENT',
      id: { notIn: [ownerProfileId, ...alreadyInvited] },
      classesAsStudent: {
        some: { classAssignments: { some: { id: document.classAssignmentId } } },
      },
    },
    select: { id: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return classmates.map((m) => ({
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email,
  }));
}

/**
 * Invite one classmate to co-author a document.
 *
 * Abuse paths, each closed in a predicate rather than by an `if` after the fetch:
 *
 *  1. Someone other than the owner invites. The document is resolved under
 *     `documentOwnerWhere`, not the read rule — so a teacher of the owner's class cannot
 *     use this, and neither can a platform admin. Sharing is the student's decision.
 *  2. Invite chaining / unbounded fan-out. A collaborator cannot invite, for the same
 *     reason: `documentGroupWhere` is never used here. Owner-only, one hop, no transitive
 *     closure.
 *  3. Cross-organization invite. `organizationId` comes from the caller's authenticated
 *     session membership, never from the request. A foreign membership id returns the
 *     same `not_a_classmate` a nonexistent one does, so this is not an enumeration
 *     oracle either.
 *  4. Invite someone in the org who is not in this class. Closed by
 *     `classesAsStudent.some.classAssignments.some.id == the document's own
 *     classAssignmentId`. ClassAssignment is unique on (assignmentId, classId), so this
 *     pins to ONE class section rather than "anyone doing this assignment anywhere" —
 *     which is also what stops a share from dragging a second teacher onto the work.
 *  5. Escalate by inviting a teacher or an admin. Closed by `role: 'STUDENT'`. Immaterial
 *     anyway, since collaborator access is strictly narrower than teacher access.
 *  6. Invite yourself. Closed by `NOT: { id: document.membershipId }` and separately
 *     reported, since it is a UI mistake rather than an attack.
 *  7. Reactivate a revoked invite by re-inviting. Deliberately allowed: the upsert clears
 *     revokedAt. The owner revoked it and the owner is the one asking.
 *  8. Deactivated account. Closed by `isActive: true` here, and on the ongoing path by
 *     the enrollment re-check inside the access predicate.
 */
export async function inviteCollaborator({
  documentId,
  ownerProfileId,
  organizationId,
  inviteeMembershipId,
}: {
  documentId: string;
  ownerProfileId: string;
  organizationId: string;
  inviteeMembershipId: string;
}): Promise<InviteResult> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      archivedAt: null,
      ...documentOwnerWhere({ profileId: ownerProfileId }),
    },
    select: {
      id: true,
      membershipId: true,
      classAssignmentId: true,
      _count: { select: { collaborators: { where: { revokedAt: null } } } },
    },
  });

  if (!document) return { ok: false, reason: 'document_not_found' };
  if (!document.classAssignmentId) {
    return { ok: false, reason: 'not_a_class_assignment' };
  }
  if (inviteeMembershipId === document.membershipId) {
    return { ok: false, reason: 'cannot_invite_self' };
  }
  if (document._count.collaborators >= MAX_COLLABORATORS) {
    return { ok: false, reason: 'collaborator_limit' };
  }

  const invitee = await prisma.orgMembership.findFirst({
    where: {
      id: inviteeMembershipId,
      // From the session, never from the request body.
      organizationId,
      isActive: true,
      role: 'STUDENT',
      NOT: { id: document.membershipId },
      classesAsStudent: {
        some: { classAssignments: { some: { id: document.classAssignmentId } } },
      },
    },
    select: { id: true },
  });

  if (!invitee) return { ok: false, reason: 'not_a_classmate' };

  const row = await prisma.documentCollaborator.upsert({
    where: {
      documentId_membershipId: {
        documentId: document.id,
        membershipId: invitee.id,
      },
    },
    create: {
      documentId: document.id,
      membershipId: invitee.id,
      invitedByMembershipId: ownerProfileId,
    },
    update: { revokedAt: null, invitedByMembershipId: ownerProfileId },
    select: collaboratorSelect,
  });

  return { ok: true, collaborator: toSummary(row) };
}

/**
 * Withdraw a collaborator. Access ends on the collaborator's next request — the read
 * predicate filters `revokedAt: null`, and nothing caches the decision.
 *
 * Two callers are permitted and both are expressed as predicates, never as a post-fetch
 * `if`: the OWNER may remove anyone, and a collaborator may remove THEMSELVES. A
 * collaborator removing a different collaborator resolves no document and gets the same
 * `document_not_found` a stranger does.
 */
export async function removeCollaborator({
  documentId,
  actorProfileId,
  targetMembershipId,
}: {
  documentId: string;
  actorProfileId: string;
  targetMembershipId: string;
}): Promise<RemoveResult> {
  const isSelfRemoval = actorProfileId === targetMembershipId;

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
      ...(isSelfRemoval
        ? // Leaving a group you are in. The caller must hold a live collaborator row;
          // enrollment is NOT re-checked, because someone who has left the class should
          // still be able to tidy up a membership they no longer want.
          {
            collaborators: {
              some: { membershipId: actorProfileId, revokedAt: null },
            },
          }
        : // Removing someone else is an owner-only power.
          documentOwnerWhere({ profileId: actorProfileId })),
    },
    select: { id: true },
  });

  if (!document) return { ok: false, reason: 'document_not_found' };

  const result = await prisma.documentCollaborator.updateMany({
    where: {
      documentId: document.id,
      membershipId: targetMembershipId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) return { ok: false, reason: 'not_a_collaborator' };

  return { ok: true };
}
