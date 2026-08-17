import { MAX_COLLABORATION_GROUP_SIZE } from '~/domain/assignments/collaboration';
import { createDocumentForAssignmentType } from '~/domain/documents.server';
import { prisma } from '~/utils/db.server';

/**
 * The second road to a shared document: a student starts one and invites
 * classmates.
 *
 * It converges on the same `DocumentGroup` machinery the teacher-assigned road
 * uses, which is the point — `documentAuthorWhere`, the token endpoint, the
 * collaborative editor, the webhook and the dual-write all work unchanged. The
 * only differences are who may create a group (`kind: 'student-share'`) and which
 * gate permits it (`Organization.studentDocumentSharingEnabled`).
 *
 * Two entry points, because a student may not have started writing yet:
 *
 * - `createSharedDocument` — a new draft, shared from birth. Nothing to seed.
 * - `shareDocumentCopy` — copies an existing draft's content into a new shared
 *   document and seeds the room from it. A **copy** rather than a conversion, so
 *   the student's original private draft is left exactly as it was and the solo
 *   editor never ends up fighting the CRDT over the same row.
 */

export class DocumentShareError extends Error {}

/** Students who share at least one active class with this student. */
export async function listShareableClassmates({
  membershipId,
}: {
  membershipId: string;
}) {
  const classmates = await prisma.orgMembership.findMany({
    where: {
      id: { not: membershipId },
      role: 'STUDENT',
      isActive: true,
      classesAsStudent: {
        some: {
          isArchived: false,
          students: { some: { id: membershipId } },
        },
      },
    },
    orderBy: { id: 'asc' },
    select: { id: true, user: { select: { name: true, email: true } } },
  });

  return classmates.map((classmate) => ({
    membershipId: classmate.id,
    name: classmate.user.name?.trim() || classmate.user.email,
  }));
}

/**
 * Validates the actor and the people they want to invite.
 *
 * The classmate check is the load-bearing one: a student may only pull in someone
 * they actually share a class with, so an id guessed or pasted from elsewhere
 * cannot be added to a draft.
 */
async function resolveShareParticipants({
  membershipId,
  inviteMembershipIds,
}: {
  membershipId: string;
  inviteMembershipIds: string[];
}) {
  const actor = await prisma.orgMembership.findFirst({
    where: { id: membershipId, role: 'STUDENT', isActive: true },
    select: {
      id: true,
      organization: { select: { studentDocumentSharingEnabled: true } },
    },
  });

  if (!actor) {
    throw new DocumentShareError('Only students can share their own drafts.');
  }
  if (!actor.organization.studentDocumentSharingEnabled) {
    throw new DocumentShareError(
      'Sharing drafts with classmates is not turned on for your school.'
    );
  }

  const invited = Array.from(new Set(inviteMembershipIds)).filter(
    (id) => id !== membershipId
  );

  if (invited.length === 0) {
    throw new DocumentShareError('Choose at least one classmate to write with.');
  }

  // +1 for the student doing the sharing.
  if (invited.length + 1 > MAX_COLLABORATION_GROUP_SIZE) {
    throw new DocumentShareError(
      `A shared draft can have at most ${MAX_COLLABORATION_GROUP_SIZE} writers.`
    );
  }

  const eligible = await listShareableClassmates({ membershipId });
  const eligibleIds = new Set(eligible.map((entry) => entry.membershipId));
  const ineligible = invited.filter((id) => !eligibleIds.has(id));

  if (ineligible.length > 0) {
    throw new DocumentShareError(
      'You can only share with classmates from your own classes.'
    );
  }

  return { memberIds: [membershipId, ...invited] };
}

/**
 * Creates the group that makes a document shared, and returns it.
 *
 * `openedAt` is set immediately: unlike the teacher road there is no seating-chart
 * phase, because the student has already decided who is in it.
 */
async function attachStudentShareGroup({
  documentId,
  memberIds,
  label,
}: {
  documentId: string;
  memberIds: string[];
  label: string;
}) {
  return prisma.documentGroup.create({
    data: {
      kind: 'student-share',
      classAssignmentId: null,
      label,
      ordinal: 0,
      openedAt: new Date(),
      documentId,
      members: { create: memberIds.map((id) => ({ membershipId: id })) },
    },
    select: { id: true, documentId: true },
  });
}

/**
 * A brand-new shared draft. Nothing to seed, because it starts empty.
 */
export async function createSharedDocument({
  membershipId,
  assignmentTypeId,
  inviteMembershipIds,
  label = 'Shared draft',
}: {
  membershipId: string;
  assignmentTypeId: string;
  inviteMembershipIds: string[];
  label?: string;
}) {
  const { memberIds } = await resolveShareParticipants({
    membershipId,
    inviteMembershipIds,
  });

  const created = await createDocumentForAssignmentType({
    membershipId,
    assignmentTypeId,
  });

  const group = await attachStudentShareGroup({
    documentId: created.documentId,
    memberIds,
    label,
  });

  return { documentId: created.documentId, groupId: group.id };
}

/**
 * Copies an existing draft into a new shared document and returns both.
 *
 * A copy, deliberately. Converting the original in place would leave the solo
 * editor still able to open and autosave that row, and its optimistic-concurrency
 * check would then fight the CRDT dual-write — the student would see conflict
 * errors on work that is not actually in conflict. Copying keeps the two document
 * rows, and therefore the two writers, entirely separate.
 *
 * The room itself is seeded by the caller, which is the only place that can talk
 * to the provider.
 */
export async function shareDocumentCopy({
  membershipId,
  sourceDocumentId,
  inviteMembershipIds,
  label = 'Shared draft',
}: {
  membershipId: string;
  sourceDocumentId: string;
  inviteMembershipIds: string[];
  label?: string;
}) {
  const { memberIds } = await resolveShareParticipants({
    membershipId,
    inviteMembershipIds,
  });

  // Owner scope, not read scope: a student may only share their own draft, not
  // one they can merely see.
  const source = await prisma.document.findFirst({
    where: { id: sourceDocumentId, membershipId, deletedAt: null },
    select: {
      id: true,
      title: true,
      html: true,
      text: true,
      assignmentTypeId: true,
    },
  });

  if (!source) {
    throw new DocumentShareError('That draft is not yours to share.');
  }

  const created = await createDocumentForAssignmentType({
    membershipId,
    assignmentTypeId: source.assignmentTypeId,
  });

  // Carry the content across so the copy is what the student expects to see, and
  // so the room can be seeded from it.
  await prisma.document.update({
    where: { id: created.documentId },
    data: {
      title: source.title,
      html: source.html ?? '',
      text: source.text ?? '',
    },
  });

  const group = await attachStudentShareGroup({
    documentId: created.documentId,
    memberIds,
    label,
  });

  return {
    documentId: created.documentId,
    groupId: group.id,
    sourceDocumentId: source.id,
    html: source.html ?? '',
  };
}
