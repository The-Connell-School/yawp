import type { Prisma } from '@app/prisma';

/**
 * Serializes roster writers per student. Always acquire these locks before
 * class-assignment locks so organization-owner and teacher roster operations
 * cannot observe or overwrite a stale class list.
 */
export async function lockStudentRosters(
  tx: Prisma.TransactionClient,
  membershipIds: string[]
) {
  for (const membershipId of [...new Set(membershipIds)].sort()) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "OrgMembership"
      WHERE "id" = ${membershipId}
      FOR UPDATE
    `;
  }
}

/**
 * Finalization and every seating-chart mutation serialize on the deployment
 * row. Reading `openedAt` without this lock leaves a window where a teacher can
 * move a student while another request is attaching live artifacts.
 */
export async function lockClassAssignmentCollaboration(
  tx: Prisma.TransactionClient,
  classAssignmentId: string
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "ClassAssignment"
    WHERE "id" = ${classAssignmentId}
    FOR UPDATE
  `;
  return rows.length === 1;
}

/**
 * Serializes roster changes with group finalization for every collaborative
 * deployment in a class. Call once per class, in sorted class-id order when a
 * mutation spans classes, before connecting or disconnecting students.
 */
export async function lockClassCollaborationDeployments(
  tx: Prisma.TransactionClient,
  classId: string
) {
  return tx.$queryRaw<Array<{ id: string }>>`
    SELECT deployment."id"
    FROM "ClassAssignment" AS deployment
    JOIN "Assignment" AS assignment
      ON assignment."id" = deployment."assignmentId"
    WHERE deployment."classId" = ${classId}
      AND assignment."collaborationEnabled" = true
    ORDER BY deployment."id"
    FOR UPDATE OF deployment
  `;
}
