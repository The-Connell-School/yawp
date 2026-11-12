/**
 * The Teachers' Lounge course that teaches teachers The Thesis-Driven Essay,
 * for the pages that point at it: the How It Works guide ("Open the course")
 * and the How to Teach It rows ("Watch tutorial", one per lesson).
 *
 * Found by the same rule as the Teacher Training page: a teacher with
 * assigned courses sees only those; one with none sees every course. A
 * lesson's video is the module titled "Lesson N: …" that has a video.
 *
 * The Lounge's own pages are temporarily disabled for all but a few teachers
 * (teacher-lounge-temporary-disable.ts), so a lesson's video is watched on
 * the assignment type's own tutorial page, never by a link into the Lounge.
 */
import { prisma } from '~/utils/db.server';

export const THESIS_ESSAY_COURSE_TITLE = 'The Thesis-Driven Essay';

export type ThesisEssayCourseLinks = {
  /** The course's id. */
  courseId: string;
  /** The course page in the Lounge. */
  coursePath: string;
  /** Each lesson's video module id, by lesson number (from 1). */
  videoModules: Record<number, string>;
};

const LESSON_NUMBER = /^\s*lesson\s+(\d{1,2})\b/i;

export async function findThesisEssayCourse(
  membershipId: string
): Promise<ThesisEssayCourseLinks | null> {
  const assigned = await prisma.orgMembership.findUnique({
    where: { id: membershipId, role: 'TEACHER' },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const course = await prisma.teacherTraining.findFirst({
    where: {
      title: { equals: THESIS_ESSAY_COURSE_TITLE, mode: 'insensitive' },
      ...((assigned?._count.assignedTeacherTrainings ?? 0) > 0
        ? { assignedTeachers: { some: { id: membershipId } } }
        : {}),
    },
    select: {
      id: true,
      teacherTrainingModules: {
        where: { videoS3Key: { not: null } },
        orderBy: { position: 'asc' },
        select: { id: true, title: true },
      },
    },
  });
  if (!course) return null;
  const videoModules: Record<number, string> = {};
  for (const module of course.teacherTrainingModules) {
    const number = Number(LESSON_NUMBER.exec(module.title)?.[1]);
    // The first module for a lesson number wins.
    if (number && !videoModules[number]) videoModules[number] = module.id;
  }
  return { courseId: course.id, coursePath: `/app/teacher-trainings/${course.id}`, videoModules };
}

/** Where a lesson's tutorial plays: the assignment type's own page for it. */
export function tutorialHref(assignmentTypeId: string, lessonNumber: number): string {
  return `/app/assignment-types/${encodeURIComponent(assignmentTypeId)}/tutorial/${lessonNumber}`;
}

/** The tutorial links for a type's How to Teach It rows, by lesson number. */
export function tutorialHrefs(
  assignmentTypeId: string,
  course: ThesisEssayCourseLinks | null
): Record<number, string> {
  return Object.fromEntries(
    Object.keys(course?.videoModules ?? {}).map((number) => [number, tutorialHref(assignmentTypeId, Number(number))])
  );
}
