import { formatClassLabel } from '~/utils/class-display';
import { prisma } from '~/utils/db.server';

import {
  summarizeLessonEvidence,
  type LessonEvidence,
} from './lesson-evidence';

/**
 * How this skill has landed in a teacher's own classes: every deployment of a
 * set that included this lesson, with the attempts their students recorded.
 *
 * Scoped to classes this teacher teaches, so one teacher never reads another's
 * results. Returns an empty summary (never throws) when the skill has not been
 * assigned yet, or when the lookup fails — the panel is a read on work that
 * already happened and must never take the lesson page down with it.
 */
export async function getLessonEvidenceForTeacher(
  lessonSlug: string,
  teacherMembershipId: string
): Promise<LessonEvidence> {
  const empty: LessonEvidence = {
    classes: [],
    studentsPracticed: 0,
    answeredCount: 0,
    correctCount: 0,
    masteredCount: 0,
    revisingCount: 0,
    misses: [],
  };

  try {
    const deployments = await prisma.writingPracticeClassAssignment.findMany({
      where: {
        class: { teachers: { some: { id: teacherMembershipId } } },
        assignment: { lessonSlugs: { has: lessonSlug } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        assignment: {
          select: { title: true, dueAt: true },
        },
        class: {
          select: {
            title: true,
            grade: true,
            period: true,
            students: { select: { id: true } },
          },
        },
        attempts: {
          // Only this skill's work: a mixed set records attempts on the other
          // lessons in it too, and none of those belong on this page.
          where: { lessonSlug },
          select: {
            membershipId: true,
            lessonSlug: true,
            promptId: true,
            status: true,
            feedbackJson: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return summarizeLessonEvidence({
      lessonSlug,
      deployments: deployments.map((deployment) => ({
        classAssignmentId: deployment.id,
        classLabel: formatClassLabel(deployment.class),
        assignmentTitle: deployment.assignment.title,
        dueAt: deployment.assignment.dueAt,
        studentIds: deployment.class.students.map((student) => student.id),
        attempts: deployment.attempts.map((attempt) => ({
          membershipId: attempt.membershipId,
          lessonSlug: attempt.lessonSlug,
          promptId: attempt.promptId,
          status: attempt.status,
          record: attempt.feedbackJson,
          createdAt: attempt.createdAt,
        })),
      })),
    });
  } catch {
    return empty;
  }
}
