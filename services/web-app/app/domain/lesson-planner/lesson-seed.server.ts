/**
 * Server side of the Class Summary → Lesson Planner hand-off: take the ids in
 * the URL, re-read the stored class insight the teacher actually owns, and
 * rebuild the opening ask from it.
 */
import { prisma } from '~/utils/db.server';
import { parseInsightResponse } from '~/domain/assignment-insights/class-insight-synthesis';
import {
  EXIT_TICKET_SEED_STEP,
  buildLessonSeed,
  pickNextStep,
} from './lesson-seed';
import {
  EXIT_TICKET_CLASS_READ_ENABLED,
  buildExitTicketClassRead,
  buildExitTicketLessonSeed,
} from '~/domain/assignment-types/exit-ticket-class-read';
import { loadExitTicketResponses } from '~/domain/assignment-types/exit-ticket-class-read.server';
import {
  isExitTicketAssignmentType,
  parseStoredExitTicketConfig,
} from '~/domain/assignment-types/exit-ticket';

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
      assignment: {
        select: {
          title: true,
          exitTicketConfigJson: true,
          assignmentType: { select: { kind: true } },
        },
      },
      class: { select: { title: true, grade: true, period: true } },
      insight: { select: { status: true, summaryJson: true } },
    },
  });
  if (!classAssignment) return null;

  const klass = classAssignment.class;
  const className =
    klass.title ??
    (klass.grade && klass.period
      ? `${klass.grade} · Period ${klass.period}`
      : (klass.grade ?? null));

  // An exit ticket's class read seeds the planner straight from the tickets.
  // The text is rebuilt here from stored responses, never taken from the URL.
  if (stepIndex === EXIT_TICKET_SEED_STEP) {
    if (
      !EXIT_TICKET_CLASS_READ_ENABLED ||
      !isExitTicketAssignmentType(classAssignment.assignment.assignmentType)
    ) {
      return null;
    }
    const responses = await loadExitTicketResponses(classAssignment.id);
    if (responses.length === 0) return null;
    const read = buildExitTicketClassRead({
      responses,
      config: parseStoredExitTicketConfig(
        classAssignment.assignment.exitTicketConfigJson
      ),
    });
    return {
      classAssignmentId: classAssignment.id,
      ...buildExitTicketLessonSeed({
        read,
        className,
        assignmentTitle: classAssignment.assignment.title ?? null,
      }),
    };
  }

  if (!classAssignment.insight || classAssignment.insight.status !== 'ready') {
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

  const seed = buildLessonSeed({
    step,
    className,
    assignmentTitle: classAssignment.assignment.title ?? null,
  });

  return { classAssignmentId: classAssignment.id, ...seed };
}
