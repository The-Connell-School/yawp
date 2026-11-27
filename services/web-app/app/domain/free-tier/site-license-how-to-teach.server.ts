import type { OrganizationPlan } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { assignmentTypeMatchesSiteLicenseLockedTile } from './site-license-locked-assignment-tiles';
import { THESIS_ESSAY_COURSE } from '~/routes/app.assignment-types.$id/landing-copy/thesis-essay-course';

/**
 * Whether this teacher's org may download or stream How to Teach It assets for
 * this assignment type. Paid and site-license orgs are unchanged.
 */
export async function isAssignmentTypeHowToTeachLockedForTeacher({
  organizationPlan,
  assignmentTypeId,
}: {
  organizationPlan: OrganizationPlan;
  assignmentTypeId: string;
}) {
  if (organizationPlan !== 'FREE_CLASSROOM') return false;
  const type = await prisma.assignmentType.findFirst({
    where: { id: assignmentTypeId, archivedAt: null },
    select: {
      title: true,
      kind: true,
      systemKey: true,
      ownerOrgId: true,
      ownerMembershipId: true,
    },
  });
  if (!type) return false;
  return assignmentTypeMatchesSiteLicenseLockedTile(type);
}

/**
 * Course files that free-classroom teachers may fetch: the Pre-writing and
 * Thesis Statement lessons, whose assignment types are in the free bundle and
 * whose pages show these decks, lesson plans and tutorial videos unlocked.
 * Every other Thesis-Driven Essay course file stays site-license only.
 */
const FREE_CLASSROOM_COURSE_LESSONS = new Set(['pre-writing', 'thesis-statement']);

const FREE_CLASSROOM_COURSE_ASSET_PATHS = new Set(
  THESIS_ESSAY_COURSE.filter(
    (lesson) =>
      lesson.yawpLesson !== null &&
      FREE_CLASSROOM_COURSE_LESSONS.has(lesson.yawpLesson)
  ).flatMap((lesson) => [
    ...(lesson.lessonPlan ? [lesson.lessonPlan.href] : []),
    ...lesson.decks.map((deck) => deck.href),
    ...lesson.handouts.map((handout) => handout.href),
    ...lesson.tutorials.flatMap((tutorial) => [
      tutorial.src,
      tutorial.poster,
      tutorial.captions,
    ]),
  ])
);

export function isFreeClassroomCourseAssetPath(pathname: string) {
  return FREE_CLASSROOM_COURSE_ASSET_PATHS.has(pathname);
}

/** True when a free-classroom teacher must not fetch locked course files. */
export async function shouldBlockSiteLicenseCourseAsset(request: Request) {
  const url = new URL(request.url);
  const userId = await requireUserId(request).catch(() => null);
  if (!userId) return true;
  const profile = await requireMembership(request, userId).catch(() => null);
  if (!profile || profile.role !== 'TEACHER') return true;
  if (profile.organization.plan !== 'FREE_CLASSROOM') return false;
  // Pre-writing and Thesis Statement pages link these files for free teachers.
  if (isFreeClassroomCourseAssetPath(url.pathname)) return false;
  const assignmentTypeId = url.searchParams.get('assignmentTypeId');
  if (assignmentTypeId) {
    return isAssignmentTypeHowToTeachLockedForTeacher({
      organizationPlan: profile.organization.plan,
      assignmentTypeId,
    });
  }
  // Thesis-Driven Essay course files are site-license-only on the free tier.
  return true;
}