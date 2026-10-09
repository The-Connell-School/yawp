import type { Prisma } from '@app/prisma';
import { deleteAssignmentPromptAttachment } from '~/domain/assignments/assignment-prompt-attachment.server';
import { lockClassAssignmentCollaboration } from '~/domain/collaboration/class-assignment-lock.server';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import {
  findReleasedRubricRevisionId,
  shouldUseInternalRubricRelease,
} from '~/domain/rubrics/rubric-release.server';
import {
  enforceFreeClassroomAssignmentCreateInTransaction,
  enforceFreeClassroomAssignmentRetypeInTransaction,
} from '~/utils/assignment-quota.server';
import { prisma } from '~/utils/db.server';

export class AssignmentHasCollaborativeWorkError extends Error {}

export async function createAssignmentDeployedToClasses(params: {
  data: Omit<
    Prisma.AssignmentUncheckedCreateInput,
    'id' | 'createdAt' | 'updatedAt'
  >;
  classIds: string[];
  deployment?: {
    postAt?: Date | null;
    dueAt?: Date | null;
  };
}) {
  const uniqueClassIds = [...new Set(params.classIds)];
  // Schools with `internal_rubrics` on pin new assignments to the rubric
  // version Yawp Internal released (RubricRelease). Decided before the
  // transaction because the flag reader uses the global client; classes from
  // more than one school keep the default pin. Never overrides an explicit
  // pin and falls back to the current revision on anything unexpected.
  const useInternalRelease =
    !params.data.rubricRevisionId &&
    (await shouldUseInternalRubricRelease(uniqueClassIds, {
      db: prisma,
      isEnabled: isFeatureFlagEnabled,
    }));
  return prisma.$transaction(async (tx) => {
    await enforceFreeClassroomAssignmentCreateInTransaction(tx, {
      classIds: uniqueClassIds,
      assignmentTypeId: String(params.data.assignmentTypeId),
    });
    const releasedRevisionId = useInternalRelease
      ? await findReleasedRubricRevisionId(
          tx,
          String(params.data.assignmentTypeId)
        )
      : null;
    const assignment = await tx.assignment.create({
      data: releasedRevisionId
        ? { ...params.data, rubricRevisionId: releasedRevisionId }
        : params.data,
    });

    if (uniqueClassIds.length > 0) {
      await tx.classAssignment.createMany({
        data: uniqueClassIds.map((classId) => ({
          assignmentId: assignment.id,
          classId,
          postAt: params.deployment?.postAt ?? null,
          dueAt: params.deployment?.dueAt ?? null,
        })),
      });
    }

    return assignment;
  });
}

export async function updateAssignmentInClassDeployment(params: {
  assignmentId: string;
  classId: string;
  data: Prisma.AssignmentUncheckedUpdateInput;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.assignment.findFirst({
      where: {
        id: params.assignmentId,
        classAssignments: { some: { classId: params.classId } },
      },
      select: { id: true, assignmentTypeId: true },
    });
    if (!existing) {
      throw new Error('assignment_not_found_for_class');
    }
    const nextAssignmentTypeId = params.data.assignmentTypeId;
    if (
      nextAssignmentTypeId &&
      nextAssignmentTypeId !== existing.assignmentTypeId
    ) {
      await enforceFreeClassroomAssignmentRetypeInTransaction(tx, {
        classIds: [params.classId],
        previousAssignmentTypeId: existing.assignmentTypeId,
        nextAssignmentTypeId: String(nextAssignmentTypeId),
      });
    }
    return tx.assignment.update({
      where: { id: existing.id },
      data: params.data,
    });
  });
}

export async function deleteClassAssignmentDeployment(params: {
  assignmentId: string;
  classId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const deployment = await tx.classAssignment.findFirst({
      where: {
        assignmentId: params.assignmentId,
        classId: params.classId,
      },
      select: {
        id: true,
        assignment: { select: { promptAttachmentKey: true } },
      },
    });

    if (!deployment) return null;

    await lockClassAssignmentCollaboration(tx, deployment.id);
    const sharedWork = await tx.documentGroup.findFirst({
      where: { classAssignmentId: deployment.id, documentId: { not: null } },
      select: { id: true },
    });
    if (sharedWork) {
      throw new AssignmentHasCollaborativeWorkError(
        'This assignment has shared group work and cannot be deleted.'
      );
    }

    await tx.classAssignment.delete({ where: { id: deployment.id } });
    const remaining = await tx.classAssignment.count({
      where: { assignmentId: params.assignmentId },
    });
    if (remaining === 0) {
      await tx.assignment.delete({ where: { id: params.assignmentId } });
    }

    return {
      id: deployment.id,
      attachmentKey:
        remaining === 0 ? deployment.assignment.promptAttachmentKey : null,
    };
  });

  if (result?.attachmentKey) {
    await deleteAssignmentPromptAttachment(result.attachmentKey).catch(
      () => {}
    );
  }

  return result?.id ?? null;
}
