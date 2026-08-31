import type { Prisma } from '@app/prisma';
import {
  isTeacherMembership,
  requireMembership,
  requireUserId,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';

export type GradingActor = {
  userId: string;
  membershipId: string;
  organizationId: string;
  teacherProfileId: string | null;
  isTeacher: boolean;
  isAdmin: boolean;
};

export async function getGradingActor(request: Request): Promise<GradingActor> {
  const userId = await requireUserId(request);
  const [membership, user] = await Promise.all([
    requireMembership(request, userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    }),
  ]);

  return {
    userId,
    membershipId: membership.id,
    organizationId: membership.organization.id,
    teacherProfileId: isTeacherMembership(membership) ? membership.id : null,
    isTeacher: isTeacherMembership(membership),
    isAdmin: hasEffectivePlatformAdmin(user?.isAdmin),
  };
}

export function canManageGrades(actor: GradingActor): boolean {
  return actor.isTeacher || actor.isAdmin;
}

export function buildTeacherClassWhere(
  actor: GradingActor
): Prisma.DocumentWhereInput {
  return buildTeacherDocumentAccessWhere({
    membershipId: actor.membershipId,
    organizationId: actor.organizationId,
    isAdmin: actor.isAdmin,
  });
}

/**
 * The graded work must be student work, never the grading teacher's own solo
 * document. Assignment-group artifacts have no student owner, so they match by
 * explicit artifact kind and remain protected by the separate teacher/class
 * predicate at every call site.
 */
export function buildGradeWriteSubjectWhere({
  actorUserId,
  releasedAt,
}: {
  actorUserId: string;
  releasedAt: Date | null;
}): Prisma.DocumentWhereInput {
  return {
    OR: [
      {
        artifactKind: 'ASSIGNMENT_GROUP',
        ...(releasedAt == null
          ? {}
          : {
              classAssignment: {
                is: {
                  class: {
                    school: {
                      organization: {
                        is: { submissionActivityEnabled: true },
                      },
                    },
                  },
                },
              },
            }),
      },
      {
        artifactKind: 'STUDENT',
        membership: {
          is: {
            userId: { not: actorUserId },
            ...(releasedAt == null
              ? {}
              : {
                  organization: {
                    is: { submissionActivityEnabled: true },
                  },
                }),
          },
        },
      },
    ],
  };
}

export function buildTeacherDocumentAccessWhere({
  membershipId,
  organizationId,
  isAdmin = false,
}: {
  membershipId: string;
  organizationId: string;
  isAdmin?: boolean;
}): Prisma.DocumentWhereInput {
  if (isAdmin) return {};
  return {
    OR: [
      {
        classAssignment: {
          class: {
            school: { organizationId },
            teachers: {
              some: {
                id: membershipId,
                isActive: true,
              },
            },
          },
        },
      },
      {
        // Only submissions from before ClassAssignment existed use the
        // student's class memberships as their source of teacher access.
        // Applying this fallback to current submissions would let a teacher
        // from an unrelated class of the same student read the submission.
        classAssignment: { is: null },
        membership: {
          is: {
            organizationId,
            classesAsStudent: {
              some: {
                school: { organizationId },
                teachers: {
                  some: {
                    id: membershipId,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    ],
  };
}

/** Document owner must never use teacher grading flows on that submission, including admins. */
export function isGradingOwnDocument(
  actorMembershipId: string,
  documentMembershipId: string | null,
  actorUserId?: string,
  documentOwnerUserId?: string
): boolean {
  return (
    (documentMembershipId != null &&
      actorMembershipId === documentMembershipId) ||
    (actorUserId != null && actorUserId === documentOwnerUserId)
  );
}
