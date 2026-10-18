/**
 * Server side of the assignment summary → Lesson Planner hand-offs: re-read
 * the stored summary the teacher actually owns, and rebuild the part the
 * hand-off names — for the opening ask, and again on every later turn.
 */
import { prisma } from '~/utils/db.server';
import { parseInsightResponse } from '~/domain/assignment-insights/class-insight-synthesis';
import { loadClassModelInputs } from '~/domain/assignment-insights/class-model-inputs.server';
import { readInsightRubric } from '~/domain/assignment-insights/insight-rubric.server';
import { scrubStudentNames } from '~/domain/assignment-insights/scrub-student-names';
import { selectHandoffModels } from '~/domain/assignment-insights/select-class-models';
import {
  isAssignmentSummaryModelsEnabled,
  isAssignmentSummaryPlannerEnabled,
} from '~/domain/feature-flags/feature-flags.server';
import {
  buildClassContext,
  buildSummaryHandoffSeed,
  formatSummaryHandoff,
  parseStoredDifferentiation,
  parseSummaryHandoff,
  type HandoffInput,
  type HandoffModels,
  type SummaryHandoff,
} from './summary-handoff';

export type LoadedSummaryHandoffSeed = {
  classAssignmentId: string;
  /** Stored on the session so later turns can rebuild the same context. */
  originSeed: string;
  prompt: string;
  context: string;
  chips: string[];
};

type Scope = {
  membershipId: string;
  organizationId: string;
  classAssignmentId: string;
};

async function loadModels(
  classAssignmentId: string,
  category: string,
  rosterNames: string[]
): Promise<HandoffModels | null> {
  const [inputs, rubric] = await Promise.all([
    loadClassModelInputs(classAssignmentId),
    readInsightRubric({ classAssignmentId }),
  ]);
  const picked = selectHandoffModels(inputs, category, rubric);
  if (!picked) return null;
  // Every name in the class, not only the writer's: papers name classmates.
  const names = [
    ...rosterNames,
    ...picked.exemplars.map((exemplar) => exemplar.studentName),
  ];
  return {
    category: picked.category,
    label: picked.label,
    skill: picked.skill,
    exemplars: picked.exemplars.map((exemplar) =>
      scrubStudentNames(exemplar.excerpt, names)
    ),
    nearMissNotes: picked.nearMissNotes.map((note) =>
      scrubStudentNames(note, names)
    ),
  };
}

async function loadHandoffInput(
  scope: Scope,
  handoff: SummaryHandoff
): Promise<{ classAssignmentId: string; input: HandoffInput } | null> {
  if (!(await isAssignmentSummaryPlannerEnabled(scope.organizationId))) {
    return null;
  }
  if (
    handoff.kind === 'models' &&
    !(await isAssignmentSummaryModelsEnabled(scope.organizationId))
  ) {
    return null;
  }

  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      id: scope.classAssignmentId,
      class: { teachers: { some: { id: scope.membershipId } } },
    },
    select: {
      id: true,
      assignment: { select: { title: true } },
      class: {
        select: {
          title: true,
          grade: true,
          period: true,
          students: { select: { user: { select: { name: true, email: true } } } },
        },
      },
      insight: { select: { status: true, summaryJson: true } },
    },
  });
  if (!classAssignment) return null;
  if (!classAssignment.insight || classAssignment.insight.status !== 'ready') {
    return null;
  }

  // The same parser the summary itself uses, so a malformed summary is
  // rejected here exactly as it would be there.
  const summary = parseInsightResponse(
    JSON.stringify(classAssignment.insight.summaryJson)
  );
  if (!summary) return null;
  const stored = classAssignment.insight.summaryJson as {
    differentiation?: unknown;
  } | null;

  const klass = classAssignment.class;
  const className =
    klass.title ??
    (klass.grade && klass.period
      ? `${klass.grade} · Period ${klass.period}`
      : (klass.grade ?? null));
  const rosterNames = klass.students.flatMap((student) =>
    [student.user?.name, student.user?.email].filter(
      (name): name is string => typeof name === 'string' && name.trim() !== ''
    )
  );

  return {
    classAssignmentId: classAssignment.id,
    input: {
      handoff,
      summary,
      differentiation: parseStoredDifferentiation(stored?.differentiation),
      className,
      assignmentTitle: classAssignment.assignment.title ?? null,
      models:
        handoff.kind === 'models'
          ? await loadModels(classAssignment.id, handoff.category, rosterNames)
          : null,
    },
  };
}

export async function loadSummaryHandoffSeed({
  handoffParam,
  ...scope
}: Scope & { handoffParam: string | null }): Promise<LoadedSummaryHandoffSeed | null> {
  const handoff = parseSummaryHandoff(handoffParam);
  if (!handoff) return null;
  const loaded = await loadHandoffInput(scope, handoff);
  if (!loaded) return null;
  const seed = buildSummaryHandoffSeed(loaded.input);
  if (!seed) return null;
  return {
    classAssignmentId: loaded.classAssignmentId,
    originSeed: formatSummaryHandoff(handoff),
    ...seed,
  };
}

/**
 * The class context for a later turn of a session opened from the summary.
 * Rebuilt from the stored summary each time, so it follows a regenerated
 * summary and disappears with the flag.
 */
export async function loadSummaryClassContext({
  originSeed,
  classAssignmentId,
  ...rest
}: Omit<Scope, 'classAssignmentId'> & {
  classAssignmentId: string | null;
  originSeed: string | null;
}): Promise<string | null> {
  if (!classAssignmentId) return null;
  const handoff = parseSummaryHandoff(originSeed);
  if (!handoff) return null;
  const loaded = await loadHandoffInput(
    { ...rest, classAssignmentId },
    handoff
  );
  return loaded ? buildClassContext(loaded.input) : null;
}
