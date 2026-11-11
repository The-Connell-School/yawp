import { prisma } from '~/utils/db.server';

import {
  LESSON_MATERIALS_COURSE_TITLE,
  lessonMaterialsFor,
  lessonModulePhraseForKind,
  type LessonMaterial,
} from './lesson-materials';

export type LessonMaterials = {
  lessonTitle: string;
  courseTitle: string;
  lessonPath: string;
  materials: LessonMaterial[];
};

/**
 * Finds the course lesson that teaches an assignment type's step, and the
 * materials that come with it, for the type's own page.
 *
 * Mirrors the Teacher's Lounge access rule: a teacher with assigned courses
 * only sees those; a teacher with none sees every course. Returns null when
 * there is nothing to link (no lesson for this type, lesson missing in this
 * environment, nothing attached, or the lookup fails) so the page leaves the
 * box out rather than showing an empty one.
 */
export async function getLessonMaterialsForAssignmentType(
  kind: string | null | undefined,
  teacherMembershipId: string
): Promise<LessonMaterials | null> {
  const titlePhrase = lessonModulePhraseForKind(kind);
  if (!titlePhrase) return null;

  try {
    const assignmentCounts = await prisma.orgMembership.findUnique({
      where: { id: teacherMembershipId, role: 'TEACHER' },
      select: { _count: { select: { assignedTeacherTrainings: true } } },
    });
    const hasAssignedCourses =
      (assignmentCounts?._count.assignedTeacherTrainings ?? 0) > 0;

    const module = await prisma.teacherTrainingModule.findFirst({
      where: {
        deletedAt: null,
        title: { contains: titlePhrase, mode: 'insensitive' },
        teacherTraining: {
          title: { equals: LESSON_MATERIALS_COURSE_TITLE, mode: 'insensitive' },
          ...(hasAssignedCourses
            ? { assignedTeachers: { some: { id: teacherMembershipId } } }
            : {}),
        },
      },
      select: {
        id: true,
        title: true,
        videoS3Key: true,
        teacherTraining: { select: { id: true, title: true } },
        resources: {
          select: { id: true, name: true, contentType: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });
    if (!module?.teacherTraining) return null;

    const materials = lessonMaterialsFor({
      trainingId: module.teacherTraining.id,
      moduleId: module.id,
      hasVideo: Boolean(module.videoS3Key),
      resources: module.resources,
    });
    if (materials.length === 0) return null;

    return {
      lessonTitle: module.title,
      courseTitle: module.teacherTraining.title,
      lessonPath: `/app/teacher-trainings/${module.teacherTraining.id}/modules/${module.id}`,
      materials,
    };
  } catch {
    // The materials are a help, not the page; never let them break it.
    return null;
  }
}
