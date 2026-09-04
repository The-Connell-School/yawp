import {
  collaborationModeAutoArranges,
  collaborationModeNeedsGroupSize,
  type CollaborationGroupMode,
} from '~/domain/assignments/collaboration';
import { prisma } from '~/utils/db.server';
import { arrangeGroups } from './groups.server';

/**
 * Forms groups at creation time for the modes that have no arrangement decision
 * left in them.
 *
 * `random` and `whole-class` both describe an arrangement completely — shuffle
 * into this size, or everyone together — so making a teacher walk to the groups
 * page and press Shuffle to reach the answer they already chose is busywork.
 * `teacher` is the mode that deliberately starts empty.
 *
 * An assignment fans out to one `ClassAssignment` per class, each with its own
 * roster, so each is arranged separately. The result is still fully editable:
 * nothing is opened here, so the teacher can rearrange or reshuffle before
 * students see anything.
 */
export async function autoArrangeNewAssignment({
  assignmentId,
  mode,
  groupSize,
}: {
  assignmentId: string;
  mode: CollaborationGroupMode;
  groupSize: number | null;
}): Promise<{ arranged: number; failed: number }> {
  if (!collaborationModeAutoArranges(mode)) {
    return { arranged: 0, failed: 0 };
  }

  const deployments = await prisma.classAssignment.findMany({
    where: { assignmentId },
    select: { id: true },
  });

  let arranged = 0;
  let failed = 0;

  for (const deployment of deployments) {
    try {
      await arrangeGroups({
        classAssignmentId: deployment.id,
        // Whole class means one group holding the roster, which planGroups
        // expresses as a null size.
        groupSize: collaborationModeNeedsGroupSize(mode) ? groupSize : null,
        // An alphabetical "random" group is not a random group.
        shuffle: true,
      });
      arranged += 1;
    } catch {
      // The assignment already exists by now. One class losing its arrangement
      // costs a shuffle on the groups page; throwing would tell the teacher the
      // creation failed when it did not.
      failed += 1;
    }
  }

  return { arranged, failed };
}
