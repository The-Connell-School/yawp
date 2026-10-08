/**
 * What the planner page needs to turn a planned practice set into an
 * assignment: which Writing Fundamentals lessons exist for this school, and —
 * only when the school has Writing Practice — the classes the teacher can
 * assign to.
 *
 * The lesson list is sent even without Writing Practice, so a practice card
 * can still name its lessons properly; the classes are what the button needs,
 * and without them the card has no button.
 */
import type { PracticeSkillOption } from '~/components/writing-lessons/practice-skill-picker';
import type { WritingPracticeAssignmentClass } from '~/components/writing-lessons/writing-practice-assignment-sheet';
import { prisma } from '~/utils/db.server';
import {
  resolveTeacherSchoolYearScope,
  schoolYearWhere,
} from '~/utils/school-year-scope.server';
import { getQuickWritingLessons } from '~/utils/writing-lessons/static-lessons.server';

export type PracticeContext = {
  lessons: PracticeSkillOption[];
  /** Null when the school has no Writing Practice: nothing can be assigned. */
  classes: WritingPracticeAssignmentClass[] | null;
};

/** The lessons a practice set may name. */
export function practiceLessonOptions(): PracticeSkillOption[] {
  return getQuickWritingLessons().map((lesson) => ({
      slug: lesson.slug,
      title: lesson.title,
      section: lesson.section,
      category: lesson.category,
    }));
}

export async function loadPracticeContext({
  request,
  membershipId,
  writingPracticeEnabled,
}: {
  request: Request;
  membershipId: string;
  writingPracticeEnabled: boolean;
}): Promise<PracticeContext> {
  const lessons = practiceLessonOptions();
  if (!writingPracticeEnabled) return { lessons, classes: null };

  const classes = await prisma.class.findMany({
    where: {
      teachers: { some: { id: membershipId } },
      isArchived: false,
      ...schoolYearWhere(
        await resolveTeacherSchoolYearScope(request, membershipId)
      ),
    },
    orderBy: [{ title: 'asc' }, { grade: 'asc' }, { period: 'asc' }],
    select: { id: true, title: true, grade: true, period: true },
  });
  return { lessons, classes };
}
