import type { Prisma } from '@app/prisma';

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
