import { Prisma } from '@app/prisma';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';

type CommentAccessAnchor = {
  submissionId: string;
  classAssignmentId: string | null;
  documentMembershipId: string | null;
  documentOwnerUserId: string | null;
  documentOrganizationId: string;
  actorOrganizationId: string;
  actorIsActive: boolean;
  actorIsAdmin: boolean;
};

/**
 * Locks every row whose mutation can revoke comment access, then rechecks the
 * exact assignment-specific authorization graph. A concurrent revocation must
 * therefore serialize either before this check (and be rejected) or after the
 * audited comment transaction commits.
 */
export async function lockSubmissionCommentAccess(
  tx: Prisma.TransactionClient,
  {
    submissionId,
    actorMembershipId,
    actorUserId,
  }: {
    submissionId: string;
    actorMembershipId: string;
    actorUserId: string;
  }
) {
  const anchors = await tx.$queryRaw<CommentAccessAnchor[]>(Prisma.sql`
    SELECT
      submission.id AS "submissionId",
      document."classAssignmentId" AS "classAssignmentId",
      owner.id AS "documentMembershipId",
      owner."userId" AS "documentOwnerUserId",
      COALESCE(owner."organizationId", school."organizationId") AS "documentOrganizationId",
      actor."organizationId" AS "actorOrganizationId",
      actor."isActive" AS "actorIsActive",
      actor_user."isAdmin" AS "actorIsAdmin"
    FROM "Submission" submission
    JOIN "Document" document ON document.id = submission."documentId"
    LEFT JOIN "OrgMembership" owner ON owner.id = document."membershipId"
    LEFT JOIN "ClassAssignment" class_assignment
      ON class_assignment.id = document."classAssignmentId"
    LEFT JOIN "Class" class ON class.id = class_assignment."classId"
    LEFT JOIN "School" school ON school.id = class."schoolId"
    JOIN "OrgMembership" actor ON actor.id = ${actorMembershipId}
    JOIN "User" actor_user ON actor_user.id = ${actorUserId}
    WHERE submission.id = ${submissionId}
      AND document."deletedAt" IS NULL
      AND actor."userId" = ${actorUserId}
    FOR UPDATE OF submission, document, actor, actor_user
  `);
  const anchor = anchors[0];
  if (
    !anchor ||
    !anchor.actorIsActive ||
    (anchor.documentOwnerUserId != null &&
      anchor.documentOwnerUserId === actorUserId)
  ) {
    return false;
  }

  if (hasEffectivePlatformAdmin(anchor.actorIsAdmin)) return true;
  if (anchor.documentOrganizationId !== anchor.actorOrganizationId) {
    return false;
  }

  if (anchor.classAssignmentId) {
    const assignedAccess = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT class_assignment.id
        FROM "ClassAssignment" class_assignment
        JOIN "Class" class ON class.id = class_assignment."classId"
        JOIN "School" school ON school.id = class."schoolId"
        JOIN "_ClassTeachers" class_teacher
          ON class_teacher."A" = class.id
          AND class_teacher."B" = ${actorMembershipId}
        WHERE class_assignment.id = ${anchor.classAssignmentId}
          AND school."organizationId" = ${anchor.actorOrganizationId}
        FOR UPDATE OF class_assignment, class, school, class_teacher
      `
    );
    return assignedAccess.length === 1;
  }

  const legacyAccess = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT class.id
    FROM "_ClassStudents" class_student
    JOIN "Class" class ON class.id = class_student."A"
    JOIN "School" school ON school.id = class."schoolId"
    JOIN "_ClassTeachers" class_teacher
      ON class_teacher."A" = class.id
      AND class_teacher."B" = ${actorMembershipId}
    WHERE class_student."B" = ${anchor.documentMembershipId}
      AND school."organizationId" = ${anchor.actorOrganizationId}
    ORDER BY class.id
    FOR UPDATE OF class_student, class, school, class_teacher
  `);
  return legacyAccess.length > 0;
}
