import { type Prisma } from '@app/prisma';
import { prisma } from './db.server';
import { hasEffectivePlatformAdmin } from './preview-access.server';

/**
 * Authorization predicates for document-scoped data.
 *
 * These return Prisma `where` fragments rather than booleans on purpose. A post-fetch
 * `if (doc.membershipId !== profile.id)` is one refactor away from being dropped and
 * leaves the row already loaded in memory; folding the rule into the query means an
 * unauthorized caller never gets the row at all, and every call site that forgets the
 * scope fails loudly in review as a bare `findUnique`.
 *
 * Two rules exist, and they are not interchangeable:
 *
 * - READ scope (`documentReadWhere`) — the student who owns the document, plus any
 *   teacher of a class that student is enrolled in. Teachers legitimately read student
 *   work; grading depends on it.
 * - WRITE scope (`documentOwnerWhere`) — the owning student only. Tutor conversations
 *   and module progress are the student's own record of work. A teacher writing into
 *   them would fabricate student dialogue, so teachers are deliberately excluded.
 *
 * Platform admin is preserved in both, matching `hasEffectivePlatformAdmin`.
 *
 * Every helper below starts by refusing an empty `profileId`. Prisma DROPS filter keys
 * whose value is `undefined`, so `{ membershipId: undefined }` does not mean "match
 * nothing", it means "no filter" — an OR arm that degrades to `{}` matches every row in
 * the table. A single call site that passes an unresolved profile id would therefore turn
 * an ownership predicate into a global read with no error and no failing test. The throw
 * is the only thing standing between that mistake and a full-table leak; do not soften it
 * into a silent `return { id: '__never__' }`.
 */

function requireProfileId(profileId: string, helper: string): void {
  if (!profileId || typeof profileId !== 'string') {
    throw new Error(`${helper} requires a non-empty profileId`);
  }
}

/** The owner arm. Written once so no caller retypes it. */
function ownerArm(profileId: string): Prisma.DocumentWhereInput {
  return { membershipId: profileId };
}

/**
 * The teacher arm: any teacher of a class the document's OWNER is enrolled in.
 *
 * This is keyed on `Document.membership` — the owner's enrollments — and collaborators
 * deliberately do not appear in it. That is what stops a share from dragging a second
 * teacher onto the work: inviting a classmate from another section grants that section's
 * teacher exactly nothing, because the teacher arm never looks at collaborators.
 */
function ownerTeacherArm(profileId: string): Prisma.DocumentWhereInput {
  return {
    membership: {
      classesAsStudent: {
        some: { teachers: { some: { id: profileId } } },
      },
    },
  };
}

/**
 * The collaborator arm — the ONLY clause in the codebase that widens document access
 * beyond owner and owner's teachers.
 *
 * Two conditions, ANDed inside the single arm:
 *
 *   1. a live DocumentCollaborator row for this caller, and
 *   2. the caller is a CURRENT student of the class this document is assigned to.
 *
 * Condition 2 is not redundant with the invite-time check, it replaces trusting it.
 * Enrollment is re-derived on every query, so a student who transfers section, drops the
 * class, or is unenrolled loses access on their very next request — no roster hook, no
 * cleanup job, no stale-row sweep. It also means a document whose classAssignmentId is
 * NULL (practice work, or a ClassAssignment that was deleted, since that FK is SetNull)
 * can never satisfy the arm at all. Access fails closed by construction.
 *
 * `profileId` is never request-supplied at any call site; it is the authenticated
 * session's membership id. There is no field an attacker controls on either side of
 * this clause.
 */
function collaboratorArm(profileId: string): Prisma.DocumentWhereInput {
  return {
    collaborators: {
      some: { membershipId: profileId, revokedAt: null },
    },
    classAssignment: {
      is: { class: { is: { students: { some: { id: profileId } } } } },
    },
  };
}

export function documentReadWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentWhereInput {
  requireProfileId(profileId, 'documentReadWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return {
    OR: [ownerArm(profileId), collaboratorArm(profileId), ownerTeacherArm(profileId)],
  };
}

/**
 * The pre-collaborator read rule: owner, plus teachers of the owner's classes. Nothing
 * else. Kept as its own helper — rather than as a comment on a call site — because there
 * are surfaces where widening to the group is the wrong answer and the distinction has to
 * survive future edits to `documentReadWhere`.
 *
 * Used by `documentCommentReadWhere`: a DocumentComment is the teacher-to-student grading
 * conversation, and it stays between the teacher and the student it is addressed to. If
 * this ever needs to become group-visible that should be a deliberate, separately
 * reviewed change, not a side effect of a helper edit made for a different reason.
 */
export function documentOwnerAndTeacherWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentWhereInput {
  requireProfileId(profileId, 'documentOwnerAndTeacherWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { OR: [ownerArm(profileId), ownerTeacherArm(profileId)] };
}

/**
 * The GROUP: the owning student plus their live collaborators, and deliberately NOT
 * teachers.
 *
 * This is `documentOwnerWhere` widened by exactly one arm. It replaces the owner rule at
 * the tutor, module-progression and paste-alert gates — surfaces where a teacher must
 * never write, because doing so fabricates student dialogue or files a plagiarism alert
 * against work the teacher did. That reasoning is unchanged; the group simply now counts
 * as "the student".
 *
 * It does NOT replace the owner rule at archive, soft delete, or unsubmit. A share must
 * not become a destructive capability — a collaborator cannot delete the group's work or
 * withdraw a teammate's submission.
 */
export function documentGroupWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentWhereInput {
  requireProfileId(profileId, 'documentGroupWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { OR: [ownerArm(profileId), collaboratorArm(profileId)] };
}

/**
 * The group rule expressed against an AssignmentModuleSession, which hangs off a
 * Document. Mirrors `documentOwnerSessionWhere`, and returns `{}` for a platform admin
 * for the same reason: so no query carries a `document: { is: {} }` no-op.
 */
export function documentGroupSessionWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.AssignmentModuleSessionWhereInput {
  requireProfileId(profileId, 'documentGroupSessionWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { document: { is: documentGroupWhere({ profileId }) } };
}

/**
 * "This submission is mine."
 *
 * Submission gained a nullable `submittedByMembershipId`; NULL means the document's
 * owner, which is exactly how ownership was derived before collaborators existed. Every
 * predicate that used to say `document: { is: { membershipId: actor } }` has to account
 * for both, and getting it wrong in the NULL direction silently detaches every
 * pre-existing submission from its student. Call this instead of writing it out.
 */
export function effectiveSubmitterWhere(
  profileId: string
): Prisma.SubmissionWhereInput {
  requireProfileId(profileId, 'effectiveSubmitterWhere');

  return {
    OR: [
      { submittedByMembershipId: profileId },
      {
        submittedByMembershipId: null,
        document: { is: { membershipId: profileId } },
      },
    ],
  };
}

/**
 * Which submissions on a document a given viewer may see listed.
 *
 * A student — owner or collaborator — sees only their own. Submissions hang off the
 * Document rather than off a student, so on a shared document an unscoped
 * `submissions: { ... }` include hands every group member their teammates'
 * submittedAt/gradedAt/releasedAt. That is a grade disclosure between students, and it is
 * the single most likely bug in this feature: it appears the moment document access is
 * widened, in code that was not edited.
 *
 * Teachers and admins get `{}` — the whole list — because grading depends on it, and the
 * predicate that let them reach the document at all already decided that.
 */
export function submissionsVisibleToViewerWhere({
  profileId,
  role,
  isAdmin,
}: {
  profileId: string;
  role: string;
  isAdmin?: boolean | null;
}): Prisma.SubmissionWhereInput {
  requireProfileId(profileId, 'submissionsVisibleToViewerWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};
  if (role !== 'STUDENT') return {};

  return effectiveSubmitterWhere(profileId);
}

/**
 * The membership that a submission belongs to, resolving the NULL-means-owner default.
 *
 * The post-fetch counterpart to `effectiveSubmitterWhere`, for the "you cannot grade or
 * release your own work" refusals. Those are refusals rather than grants, so computing
 * them after the row is loaded is correct — the predicate has already decided the caller
 * may see the submission at all.
 */
export function effectiveSubmitterId(submission: {
  submittedByMembershipId: string | null;
  document: { membershipId: string };
}): string {
  return submission.submittedByMembershipId ?? submission.document.membershipId;
}

/**
 * Documents that are NOT shared with anyone.
 *
 * Used to hold group work out of class-level AI insight generation. Those prompts pull a
 * student's name and email alongside submission text; a shared document counted once
 * represents several students and attributes group prose to one named person inside a
 * model prompt. Excluding shared documents undercounts the class slightly, which is the
 * cheaper error.
 */
export function unsharedDocumentWhere(): Prisma.DocumentWhereInput {
  return { collaborators: { none: { revokedAt: null } } };
}

export function documentOwnerWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentWhereInput {
  requireProfileId(profileId, 'documentOwnerWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { membershipId: profileId };
}

/**
 * The same owner rule, expressed against a model that hangs off a Document
 * (AssignmentModuleSession). Returns `{}` for a platform admin rather than an empty
 * relation filter, so no query ever carries a `document: { is: {} }` no-op.
 */
export function documentOwnerSessionWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.AssignmentModuleSessionWhereInput {
  requireProfileId(profileId, 'documentOwnerSessionWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { document: { is: { membershipId: profileId } } };
}

/**
 * A comment thread is readable and repliable by the owning student and the teachers of
 * that student's classes, because a reply is part of the same grading conversation the
 * comment itself is.
 *
 * NOTE: this is pinned to `documentOwnerAndTeacherWhere`, not to `documentReadWhere`. It
 * used to be defined in terms of the read rule, and leaving it that way would have made
 * every teacher feedback comment on a shared document readable by the whole group as an
 * invisible side effect of widening a helper somewhere else — a teacher-to-student
 * grading conversation becoming group-visible with no line in the diff that says so.
 * Collaborators get the body, not the teacher's remarks about the author.
 *
 * Returns `{}` for a platform admin for the same reason as `documentOwnerSessionWhere`:
 * so no query carries a `document: { is: {} }` no-op.
 */
export function documentCommentReadWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentCommentWhereInput {
  requireProfileId(profileId, 'documentCommentReadWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { document: { is: documentOwnerAndTeacherWhere({ profileId }) } };
}

export async function getIsPlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  return hasEffectivePlatformAdmin(user?.isAdmin);
}
