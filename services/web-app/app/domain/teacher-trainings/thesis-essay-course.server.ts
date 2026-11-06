/**
 * The Teachers' Lounge course that teaches teachers The Thesis-Driven Essay,
 * for the pages that point at it: the How It Works guide ("Open the course")
 * and the How to Teach It rows ("Watch tutorial", one per lesson).
 *
 * Found by the same rule as the Teacher Training page: a teacher with
 * assigned courses sees only those; one with none sees every course. A
 * lesson's video is the module titled "Lesson N: …" that has a video.
 */
import { prisma } from '~/utils/db.server';

export const THESIS_ESSAY_COURSE_TITLE = 'The Thesis-Driven Essay';

export type ThesisEssayCourseLinks = {
  /** The course page. */
  coursePath: string;
  /** Each lesson's video module, by lesson number (from 1). */
  videos: Record<number, string>;
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
  const videos: Record<number, string> = {};
  for (const module of course.teacherTrainingModules) {
    const number = Number(LESSON_NUMBER.exec(module.title)?.[1]);
    // The first module for a lesson number wins.
    if (number && !videos[number]) videos[number] = `/app/teacher-trainings/${course.id}/modules/${module.id}`;
  }
  return { coursePath: `/app/teacher-trainings/${course.id}`, videos };
}
