/**
 * Server side of the Class Summary → Lesson Planner hand-off: take the ids in
 * the URL, re-read the stored class insight the teacher actually owns, and
 * rebuild the opening ask from it.
 */
import { prisma } from '~/utils/db.server';
import { parseInsightResponse } from '~/domain/assignment-insights/class-insight-synthesis';
import { buildLessonSeed, pickNextStep } from './lesson-seed';

export type LoadedLessonSeed = {
  classAssignmentId: string;
  prompt: string;
  context: string;
};

export async function loadLessonSeed({
  membershipId,
  classAssignmentId,
  stepIndex,
}: {
  membershipId: string;
  classAssignmentId: string | null;
  stepIndex: string | null;
}): Promise<LoadedLessonSeed | null> {
  if (!classAssignmentId) return null;

  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      id: classAssignmentId,
      class: { teachers: { some: { id: membershipId } } },
    },
    select: {
      id: true,
      assignment: { select: { title: true } },
      class: { select: { title: true, grade: true, period: true } },
      insight: { select: { status: true, summaryJson: true } },
    },
  });
  if (!classAssignment?.insight || classAssignment.insight.status !== 'ready') {
    return null;
  }

  // Reuse the synthesis parser so a malformed or half-written summary is
  // rejected here exactly as it would be on the Class Summary itself.
  const summary = parseInsightResponse(
    JSON.stringify(classAssignment.insight.summaryJson)
  );
  if (!summary) return null;

  const step = pickNextStep(summary, stepIndex);
  if (!step) return null;

  const klass = classAssignment.class;
  const className =
    klass.title ??
    (klass.grade && klass.period
      ? `${klass.grade} · Period ${klass.period}`
      : (klass.grade ?? null));

  const seed = buildLessonSeed({
    step,
    className,
    assignmentTitle: classAssignment.assignment.title ?? null,
  });

  return { classAssignmentId: classAssignment.id, ...seed };
}
