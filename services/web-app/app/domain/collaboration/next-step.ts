/**
 * Where a teacher goes immediately after creating a collaborative assignment.
 *
 * Creating one is not the end of the job — the groups still have to be built and
 * opened, and students see nothing until they are. Leaving the teacher wherever
 * they happened to be, which is what the sheet did, makes the remaining step
 * invisible and the assignment look finished when it is not.
 *
 * Every deployment needs a seating chart, so creation always goes to the first
 * one. Finalization advances to the next incomplete deployment.
 */
export function groupSetupNextStep({
  collaborationEnabled,
  deployments,
}: {
  assignmentId: string;
  collaborationEnabled: boolean;
  deployments: { classAssignmentId: string; classId: string }[];
}): { url: string; classCount: number } | null {
  if (!collaborationEnabled || deployments.length === 0) return null;

  return {
    url: `/app/class-assignments/${deployments[0].classAssignmentId}/groups`,
    classCount: deployments.length,
  };
}
