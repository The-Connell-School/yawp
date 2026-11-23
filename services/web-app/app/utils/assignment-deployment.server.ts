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
import { SOLO_COLLABORATION_SETTINGS } from '~/domain/assignments/collaboration';
import { stripCollaborationFromAssignmentUpdateData } from '~/utils/assignment-collaboration.server';
import { prisma } from '~/utils/db.server';
import { formatClassLabel } from '~/utils/class-display';

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
      data: {
        ...(releasedRevisionId
          ? { ...params.data, rubricRevisionId: releasedRevisionId }
          : params.data),
        ...SOLO_COLLABORATION_SETTINGS,
      },
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

    return { assignment, classIds: uniqueClassIds };
  }).then(async (result) => {
    if (result.classIds.length > 0) {
      const { applyDevPanelSimulationForNewClassAssignments } = await import(
        '~/dev-panel/class-simulation.server'
      );
      await applyDevPanelSimulationForNewClassAssignments({
        classIds: result.classIds,
        assignmentId: result.assignment.id,
      });
    }
    return result.assignment;
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
      select: {
        id: true,
        assignmentTypeId: true,
        collaborationEnabled: true,
      },
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
      data: stripCollaborationFromAssignmentUpdateData(
        existing.collaborationEnabled,
        params.data as Record<string, unknown>
      ) as Prisma.AssignmentUncheckedUpdateInput,
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

/**
 * A teacher's class change on an existing assignment that cannot be applied.
 * `status` is the HTTP status the route should answer with.
 */
export class AssignmentClassChangeError extends Error {
  constructor(
    message: string,
    readonly status: number = 409
  ) {
    super(message);
  }
}

export type AssignmentClassChangePlan = {
  classIds: string[];
  added: string[];
  removed: string[];
};

/**
 * Works out which of a teacher's classes an existing assignment should be
 * added to and taken off, from the full list the teacher picked in the editor.
 * Pure so the rules are testable without a database.
 */
export function planAssignmentClassChange(params: {
  currentClassIds: readonly string[];
  requestedClassIds: readonly string[];
}): AssignmentClassChangePlan {
  const requested = [
    ...new Set(params.requestedClassIds.map((id) => id.trim()).filter(Boolean)),
  ];
  const current = new Set(params.currentClassIds);
  return {
    classIds: requested,
    added: requested.filter((id) => !current.has(id)),
    removed: [...current].filter((id) => !requested.includes(id)),
  };
}

/**
 * Changes which of the teacher's classes an existing assignment is assigned
 * to (Brian, 11/23: the classes were locked on edit).
 *
 * Only the teacher's own classes are touched; a co-teacher's deployments are
 * left alone. Two real constraints stay:
 *  - a class whose students already started documents on this assignment
 *    cannot be taken off, because removing the deployment would orphan their
 *    work (Document.classAssignment is SetNull);
 *  - a group project keeps its classes, because each class's groups are
 *    arranged when it is created.
 */
export async function changeAssignmentClasses(params: {
  assignmentId: string;
  teacherMembershipId: string;
  requestedClassIds: readonly string[];
  deployment: { postAt?: Date | null; dueAt?: Date | null };
}): Promise<AssignmentClassChangePlan> {
  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({
      where: { id: params.assignmentId },
      select: { id: true, collaborationEnabled: true },
    });
    if (!assignment) {
      throw new AssignmentClassChangeError('Assignment not found.', 404);
    }

    const currentDeployments = await tx.classAssignment.findMany({
      where: {
        assignmentId: params.assignmentId,
        class: { teachers: { some: { id: params.teacherMembershipId } } },
      },
      select: {
        id: true,
        classId: true,
        class: { select: { grade: true, period: true, title: true } },
      },
    });

    const plan = planAssignmentClassChange({
      currentClassIds: currentDeployments.map((row) => row.classId),
      requestedClassIds: params.requestedClassIds,
    });

    if (plan.classIds.length === 0) {
      throw new AssignmentClassChangeError(
        'Choose at least one class for this assignment.',
        400
      );
    }
    if (plan.added.length === 0 && plan.removed.length === 0) return plan;

    if (assignment.collaborationEnabled) {
      throw new AssignmentClassChangeError(
        "A group project's classes can't change after it is created."
      );
    }

    if (plan.added.length > 0) {
      const addable = await tx.class.findMany({
        where: {
          id: { in: plan.added },
          isArchived: false,
          teachers: { some: { id: params.teacherMembershipId } },
        },
        select: { id: true },
      });
      if (addable.length !== plan.added.length) {
        throw new AssignmentClassChangeError('Class not found.', 404);
      }
    }

    const removing = currentDeployments.filter((row) =>
      plan.removed.includes(row.classId)
    );
    for (const deployment of removing) {
      await lockClassAssignmentCollaboration(tx, deployment.id);
      const startedWork = await tx.document.findFirst({
        where: { classAssignmentId: deployment.id },
        select: { id: true },
      });
      if (startedWork) {
        throw new AssignmentClassChangeError(
          `${formatClassLabel(deployment.class)} can't be taken off this assignment because students there have already started it.`
        );
      }
    }
    if (removing.length > 0) {
      await tx.classAssignment.deleteMany({
        where: { id: { in: removing.map((row) => row.id) } },
      });
    }

    if (plan.added.length > 0) {
      await tx.classAssignment.createMany({
        data: plan.added.map((classId) => ({
          assignmentId: params.assignmentId,
          classId,
          postAt: params.deployment.postAt ?? null,
          dueAt: params.deployment.dueAt ?? null,
        })),
        skipDuplicates: true,
      });
    }

    return plan;
  });

  if (result.added.length > 0) {
    const { applyDevPanelSimulationForNewClassAssignments } = await import(
      '~/dev-panel/class-simulation.server'
    );
    await applyDevPanelSimulationForNewClassAssignments({
      classIds: result.added,
      assignmentId: params.assignmentId,
    });
  }

  return result;
}
