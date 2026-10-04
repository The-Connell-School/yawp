import { Prisma } from '@app/prisma';
import {
  aggregateRubricPerformance,
  type GradedSubmissionInput,
} from '~/domain/assignment-insights/aggregate-rubric-performance';
import { generateClassInsight } from '~/domain/assignment-insights/class-insight-synthesis.server';
import {
  classInsightRegenerationCooldownMessage,
  getClassInsightRegenerationCooldown,
} from '~/domain/assignment-insights/class-insight-regeneration-cooldown';
import {
  buildDifferentiation,
  type DifferentiationInput,
} from '~/domain/assignment-insights/differentiate-students';
import type { ClassInsightSummary } from '~/domain/assignment-insights/class-insight-synthesis';
import { readInsightRubric } from '~/domain/assignment-insights/insight-rubric.server';
import { getParagraphMode } from '~/domain/assignment-types/daily-pages-paragraph-modes';
import { prisma } from '~/utils/db.server';
import {
  AiRateLimitError,
  reserveAiRequest,
} from '~/utils/ai-admission.server';

const CLASS_INSIGHT_ADMISSION_POLICY = {
  membershipLimit: 6,
  membershipWindowMs: 60_000,
  organizationLimit: 60,
  organizationWindowMs: 60 * 60_000,
};

export type GenerateClassAssignmentInsightResult =
  | {
      success: true;
      insight: {
        classAssignmentId: string;
        status: 'ready';
        model: string;
        submissionCount: number;
        generatedAt: string;
        summary: ClassInsightSummary;
      };
    }
  | {
      success: false;
      status: number;
      message: string;
      cooldownUntil?: string;
      retryAfterSeconds?: number;
    };

function classLabel(klass: {
  grade: string | null;
  period: string | null;
}): string | null {
  const parts = [
    klass.grade ? `Grade ${klass.grade}` : null,
    klass.period ? `Period ${klass.period}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

async function recordClassInsightFailure(input: {
  classAssignmentId: string;
  submissionCount: number;
  generatedByMembershipId: string | null;
  generatedAt: Date;
  model?: string;
}) {
  const data = {
    status: 'failed',
    submissionCount: input.submissionCount,
    generatedByMembershipId: input.generatedByMembershipId,
    generatedAt: input.generatedAt,
    ...(input.model ? { model: input.model } : {}),
  };
  const updated = await prisma.classAssignmentInsight.updateMany({
    where: {
      classAssignmentId: input.classAssignmentId,
      status: 'failed',
    },
    data,
  });
  if (updated.count > 0) return;

  try {
    await prisma.classAssignmentInsight.create({
      data: {
        classAssignmentId: input.classAssignmentId,
        ...data,
      },
    });
  } catch (error) {
    if (!(
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )) {
      throw error;
    }
  }
}

async function loadDifferentiationInputs(classAssignmentId: string) {
  const documents = await prisma.document.findMany({
    where: { classAssignmentId, deletedAt: null },
    select: {
      id: true,
      membership: {
        select: { user: { select: { name: true, email: true } } },
      },
      group: { select: { label: true } },
      submissions: {
        where: { gradedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { id: true, rubricScores: true, overallComment: true },
      },
    },
  });

  return documents.flatMap((doc) => {
    const submission = doc.submissions[0];
    if (!submission) return [];
    return [
      {
        submissionId: submission.id,
        studentName:
          doc.group?.label?.trim() ||
          doc.membership?.user?.name?.trim() ||
          doc.membership?.user?.email?.trim() ||
          null,
        href: `/app/submissions/${submission.id}`,
        rubricScores:
          submission.rubricScores as GradedSubmissionInput['rubricScores'],
        overallComment: submission.overallComment,
      },
    ] satisfies DifferentiationInput[];
  });
}

/**
 * The conditions the class wrote under, for the summary to read the scores
 * against. Each is null or false when the assignment set none, which leaves the
 * summary prompt as it was.
 */
function writingConditions(assignment: {
  tutorEnabled?: boolean | null;
  writingTimeMinutes?: number | null;
  paragraphMode?: string | null;
  grammarGradingEnabled?: boolean | null;
  assignmentType?: { title?: string | null } | null;
}) {
  return {
    assignmentTypeTitle: assignment.assignmentType?.title ?? null,
    paragraphModeLabel: getParagraphMode(assignment.paragraphMode)?.label ?? null,
    writingTimeMinutes: assignment.writingTimeMinutes ?? null,
    coldWrite: assignment.tutorEnabled === false,
    grammarGraded: assignment.grammarGradingEnabled ?? null,
  };
}

export async function generateClassAssignmentInsight(input: {
  classAssignmentId: string;
  organizationId: string;
  generatedByMembershipId: string | null;
}): Promise<GenerateClassAssignmentInsightResult> {
  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      id: input.classAssignmentId,
      class: {
        school: {
          organizationId: input.organizationId,
          organization: { classInsightsEnabled: true },
        },
      },
    },
    select: {
      id: true,
      classId: true,
      assignment: {
        select: {
          title: true,
          tutorEnabled: true,
          writingTimeMinutes: true,
          paragraphMode: true,
          grammarGradingEnabled: true,
          assignmentType: { select: { title: true } },
        },
      },
      class: {
        select: {
          grade: true,
          period: true,
          school: {
            select: {
              organizationId: true,
              organization: { select: { classInsightsEnabled: true } },
            },
          },
        },
      },
    },
  });

  if (!classAssignment) {
    return {
      success: false,
      status: 404,
      message: 'Assignment not found.',
    };
  }

  const existingInsight = await prisma.classAssignmentInsight.findUnique({
    where: { classAssignmentId: classAssignment.id },
    select: {
      status: true,
      generatedAt: true,
      summaryJson: true,
      submissionCount: true,
    },
  });
  const hasReadyInsight = Boolean(
    existingInsight?.status === 'ready' &&
    existingInsight.summaryJson &&
    existingInsight.generatedAt
  );
  if (hasReadyInsight) {
    const cooldown = getClassInsightRegenerationCooldown(
      existingInsight!.generatedAt
    );
    if (cooldown.inCooldown) {
      return {
        success: false,
        status: 429,
        message: classInsightRegenerationCooldownMessage(cooldown.remainingMs)!,
        cooldownUntil: cooldown.availableAt!.toISOString(),
        retryAfterSeconds: Math.ceil(cooldown.remainingMs / 1000),
      };
    }
  }

  const differentiationInputs = await loadDifferentiationInputs(
    classAssignment.id
  );
  if (differentiationInputs.length === 0) {
    return {
      success: false,
      status: 400,
      message:
        'No graded submissions yet. Grade a few submissions first, then generate class insights.',
    };
  }

  if (
    hasReadyInsight &&
    differentiationInputs.length <= existingInsight!.submissionCount
  ) {
    return {
      success: false,
      status: 409,
      message: 'No new graded submissions since the last summary.',
    };
  }

  // The rubric the class was graded on, not the five default categories. Read
  // against the wrong rubric every category comes back "not scored", and the
  // summary is a summary of nothing.
  const rubric = await readInsightRubric({
    classAssignmentId: classAssignment.id,
  });
  const aggregate = aggregateRubricPerformance(differentiationInputs, rubric);
  const generatedAt = new Date();

  if (input.generatedByMembershipId) {
    try {
      await reserveAiRequest({
        membershipId: input.generatedByMembershipId,
        organizationId: input.organizationId,
        feature: 'class-insight',
        policy: CLASS_INSIGHT_ADMISSION_POLICY,
      });
    } catch (error) {
      if (error instanceof AiRateLimitError) {
        return {
          success: false,
          status: 429,
          message:
            'Too many class insight requests. Please wait and try again.',
          retryAfterSeconds: error.retryAfterSeconds,
        };
      }
      return {
        success: false,
        status: 503,
        message:
          'Class insights are temporarily unavailable. Please try again.',
      };
    }
  }

  let generated: Awaited<ReturnType<typeof generateClassInsight>>;
  try {
    generated = await generateClassInsight({
      aggregate,
      context: {
        assignmentTitle: classAssignment.assignment.title,
        className: classLabel(classAssignment.class),
        ...writingConditions(classAssignment.assignment),
      },
      rubric,
      metadata: { classAssignmentId: classAssignment.id },
      attribution: {
        organizationId: input.organizationId,
        membershipId: input.generatedByMembershipId ?? undefined,
        classId: classAssignment.classId,
      },
    });
  } catch {
    await recordClassInsightFailure({
      classAssignmentId: classAssignment.id,
      submissionCount: aggregate.submissionCount,
      generatedByMembershipId: input.generatedByMembershipId,
      generatedAt,
    });
    return {
      success: false,
      status: 502,
      message: 'Class insights are temporarily unavailable. Please try again.',
    };
  }

  const { summary, model } = generated;
  const baseRow = {
    model,
    submissionCount: aggregate.submissionCount,
    generatedByMembershipId: input.generatedByMembershipId,
    generatedAt,
  };

  if (!summary) {
    await recordClassInsightFailure({
      classAssignmentId: classAssignment.id,
      ...baseRow,
    });
    return {
      success: false,
      status: 502,
      message: 'The assistant returned an unusable summary. Please try again.',
    };
  }

  const differentiation = buildDifferentiation(differentiationInputs, rubric);
  const enrichedSummary = differentiation
    ? { ...summary, differentiation }
    : summary;
  const summaryJson = enrichedSummary as unknown as Prisma.InputJsonValue;

  await prisma.classAssignmentInsight.upsert({
    where: { classAssignmentId: classAssignment.id },
    create: {
      classAssignmentId: classAssignment.id,
      status: 'ready',
      summaryJson,
      ...baseRow,
    },
    update: { status: 'ready', summaryJson, ...baseRow },
  });

  return {
    success: true,
    insight: {
      classAssignmentId: classAssignment.id,
      status: 'ready',
      model,
      submissionCount: aggregate.submissionCount,
      generatedAt: generatedAt.toISOString(),
      summary: enrichedSummary,
    },
  };
}
