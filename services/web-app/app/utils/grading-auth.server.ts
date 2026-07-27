import type { Prisma } from '@app/prisma';
import {
  isTeacherMembership,
  requireMembership,
  requireUserId,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export type GradingActor = {
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
    membershipId: membership.id,
    organizationId: membership.organization.id,
    teacherProfileId: isTeacherMembership(membership) ? membership.id : null,
    isTeacher: isTeacherMembership(membership),
    isAdmin: Boolean(user?.isAdmin),
  };
}

export function canManageGrades(actor: GradingActor): boolean {
  return actor.isTeacher || actor.isAdmin;
}

export function buildTeacherClassWhere(
  actor: GradingActor
): Prisma.DocumentWhereInput {
  if (actor.isAdmin) return {};
  return {
    OR: [
      {
        classAssignment: {
          class: {
            teachers: {
              some: {
                id: actor.membershipId,
              },
            },
          },
        },
      },
      {
        membership: {
          classesAsStudent: {
            some: {
              teachers: {
                some: {
                  id: actor.membershipId,
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
  documentMembershipId: string
): boolean {
  return actorMembershipId === documentMembershipId;
}
