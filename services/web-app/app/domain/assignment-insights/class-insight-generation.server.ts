import { Prisma } from '@app/prisma';
import { loadClassInsightInputs } from './class-insight-inputs.server';
import {
  CLASS_INSIGHT_INPUT_VERSION,
  classInsightFingerprint,
  isClassInsightCurrent,
} from './class-insight-cache';
import { aggregateRubricPerformance } from '~/domain/assignment-insights/aggregate-rubric-performance';
import { generateClassInsight } from '~/domain/assignment-insights/class-insight-synthesis.server';
import {
  classInsightRegenerationCooldownMessage,
  getClassInsightRegenerationCooldown,
} from '~/domain/assignment-insights/class-insight-regeneration-cooldown';
import { buildDifferentiation } from '~/domain/assignment-insights/differentiate-students';
import type { ClassInsightSummary } from '~/domain/assignment-insights/class-insight-synthesis';
import { readInsightRubric } from '~/domain/assignment-insights/insight-rubric.server';
import { prisma } from '~/utils/db.server';
import {
  AiFreeTierBudgetExceededError,
  AiRateLimitError,
  aiFreeTierBudgetExceededMessage,
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
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
    ) {
      throw error;
    }
  }
}

/**
 * The conditions the class wrote under, for the summary to read the scores
 * against. Each is null or false when the assignment set none, which leaves the
 * summary prompt as it was.
 */
function writingConditions(assignment: {
  tutorEnabled?: boolean | null;
  grammarGradingEnabled?: boolean | null;
  assignmentType?: { title?: string | null } | null;
}) {
  return {
    assignmentTypeTitle: assignment.assignmentType?.title ?? null,
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
  const differentiationInputs =
    (await loadClassInsightInputs([classAssignment.id])).get(
      classAssignment.id
    ) ?? [];
  const gradeFingerprint = classInsightFingerprint(differentiationInputs);
  const hasReadyInsight = Boolean(
    existingInsight?.status === 'ready' &&
    existingInsight.summaryJson &&
    existingInsight.generatedAt &&
    isClassInsightCurrent(existingInsight.summaryJson, gradeFingerprint)
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
      if (error instanceof AiFreeTierBudgetExceededError) {
        return {
          success: false,
          status: 402,
          message: aiFreeTierBudgetExceededMessage(),
        };
      }
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
  const enrichedSummary = {
    ...summary,
    ...(differentiation ? { differentiation } : {}),
    scoredCount: aggregate.scoredCount,
    inputVersion: CLASS_INSIGHT_INPUT_VERSION,
    gradeFingerprint,
  };
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
