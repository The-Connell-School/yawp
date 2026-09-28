import { prisma } from '~/utils/db.server';

export type LoungeModuleLink = {
  trainingId: string;
  trainingTitle: string;
  moduleId: string;
  moduleTitle: string;
};

/**
 * Composition lesson slug -> a stable phrase from the matching Teacher's
 * Lounge module title. Matching by phrase (not ID) keeps the link working
 * across environments and lets admins retitle modules as long as the phrase
 * survives ("Lesson 3: Developing a Thesis Statement" etc.).
 */
const LOUNGE_MODULE_TITLE_PHRASES: Record<string, string> = {
  // Topic sentences, evidence, and analysis are all taught in Brian's Body
  // Paragraphs module (topic sentence -> evidence -> analysis is his body
  // paragraph structure).
  'topic-sentences': 'Body Paragraphs',
  evidence: 'Body Paragraphs',
  analysis: 'Body Paragraphs',
  'thesis-statements': 'Developing a Thesis Statement',
  'hooks-and-openings': 'Introduction Paragraph',
  conclusions: 'The Conclusion',
};

/**
 * Finds the Teacher's Lounge module that teaches a composition lesson's
 * skill, so the lesson page can link teachers to Brian's video + resources.
 *
 * Mirrors the Lounge's own access rule: a teacher with assigned courses only
 * sees modules from those courses; a teacher with none sees every course.
 * Returns null whenever there is nothing safe to link to (unknown lesson,
 * module missing in this environment, or the lookup fails) so the lesson page
 * simply omits the link.
 */
export async function getLoungeModuleLinkForLesson(
  lessonSlug: string,
  teacherMembershipId: string
): Promise<LoungeModuleLink | null> {
  const titlePhrase = LOUNGE_MODULE_TITLE_PHRASES[lessonSlug];
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
        teacherTraining: hasAssignedCourses
          ? { assignedTeachers: { some: { id: teacherMembershipId } } }
          : {},
      },
      select: {
        id: true,
        title: true,
        teacherTraining: { select: { id: true, title: true } },
      },
      orderBy: { position: 'asc' },
    });
    if (!module?.teacherTraining) return null;

    return {
      trainingId: module.teacherTraining.id,
      trainingTitle: module.teacherTraining.title,
      moduleId: module.id,
      moduleTitle: module.title,
    };
  } catch {
    // The link is a nice-to-have; never let it break the lesson page.
    return null;
  }
}
