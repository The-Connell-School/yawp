import type { Prisma } from '@app/prisma';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export type GradingActor = {
  profileId: string;
  isTeacher: boolean;
  isAdmin: boolean;
};

export async function getGradingActor(
  request: Request
): Promise<GradingActor> {
  const userId = await requireUserId(request);
  const [profile, user] = await Promise.all([
    requireProfile(request, userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    }),
  ]);

  return {
    profileId: profile.id,
    isTeacher: Boolean(profile.teacherProfile),
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
        assignment: {
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
