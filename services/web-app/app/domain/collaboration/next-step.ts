/**
 * Where a teacher goes immediately after creating a collaborative assignment.
 *
 * Creating one is not the end of the job — the groups still have to be built and
 * opened, and students see nothing until they are. Leaving the teacher wherever
 * they happened to be, which is what the sheet did, makes the remaining step
 * invisible and the assignment look finished when it is not.
 *
 * One class has no choice to present, so it goes straight to the seating chart.
 * Several classes need several charts, and the assignment page is the one place
 * that lists them behind its class switcher.
 */
export function groupSetupNextStep({
  assignmentId,
  collaborationEnabled,
  deployments,
}: {
  assignmentId: string;
  collaborationEnabled: boolean;
  deployments: { classAssignmentId: string; classId: string }[];
}): { url: string; classCount: number } | null {
  if (!collaborationEnabled || deployments.length === 0) return null;

  if (deployments.length === 1) {
    return {
      url: `/app/class-assignments/${deployments[0].classAssignmentId}/groups`,
      classCount: 1,
    };
  }

  return {
    url: `/app/assignments/${assignmentId}?classId=${deployments[0].classId}`,
    classCount: deployments.length,
  };
}
