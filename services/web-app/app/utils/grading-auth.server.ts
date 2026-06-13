import type { Prisma } from '@app/prisma';
import {
  isTeacherMembership,
  requireMembership,
  requireUserId,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export type GradingActor = {
  profileId: string;
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
    profileId: membership.id,
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
                profileId: actor.profileId,
              },
            },
          },
        },
      },
      {
        studentProfile: {
          classes: {
            some: {
              teachers: {
                some: {
                  profileId: actor.profileId,
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
  actorProfileId: string,
  documentProfileId: string
): boolean {
  return actorProfileId === documentProfileId;
}
