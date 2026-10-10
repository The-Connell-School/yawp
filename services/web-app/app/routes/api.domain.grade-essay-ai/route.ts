import {
  teacherNotesEnabled as hasTeacherNotes,
  normalizeTeacherNote,
  overallCommentWriterRules,
  gradingRepairPrivateObservationRules,
} from '~/domain/grading/teacher-notes';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@app/prisma';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { isLlmFallbackRetrySignal } from '~/utils/getLLMCompletion/llm-provider-errors.server';
import { parseStoredExitTicketConfig } from '~/domain/assignment-types/exit-ticket';
import { buildExitTicketGradingContext } from '~/domain/assignment-types/exit-ticket-rubric';
import { computeIpHash } from '~/utils/ai-usage-log.server';
import {
  computeWeightedBandPercentage,
  formatGrade,
  letterFromPercent,
  scoreToPercent,
} from '~/domain/grading/gradeMath';
import {
  ACT_WRITING_SCORING_TYPE,
  rubricScaleGradeFields,
} from '~/domain/grading/recorded-grade';
import { gradingAddressee } from '~/domain/grading/personalize';
import { parseGrammarIssuesPayload } from '~/domain/grading/grammarIssues';
import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { scaleDailyPagesForAssignment } from '~/domain/assignment-types/daily-pages-assignment-points';
import type { RubricCategory as GradingRubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  isGrammarHighlightCategory,
  isScoreInCategoryAllowedScores,
  isScoreInCategoryBands,
} from '~/domain/assignment-types/rubric-category-options';
import { applyGrammarHighlightScoreClamp } from '~/domain/grading/grammar-highlight-scoring';
import {
  applyDisplayGrammarCategories,
  resolveDisplayOptions,
  serializeDisplaySnapshot,
  shouldRunGrammarChecker,
} from '~/domain/grading/rubric-display-options';
import { readOutputSchemaDisplay } from '~/domain/rubrics/output-schema-display';
import {
  buildGrammarCheckerRetryUserPrompt,
  buildGrammarCheckerSystemPrompt,
  buildGrammarCheckerUserPrompt,
} from '~/domain/grading/grammar-checker-prompts';
import {
  buildGradingPromptShape,
  buildGradingResponseSchemaText,
} from '~/domain/grading/grading-prompt-shape';
import {
  applyGradingAssistantStrictnessToActComposite,
  applyGradingAssistantStrictnessToPercentage,
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  parseGradingAssistantStrictnessLevel,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { compileGradingAssistantInvocation } from '~/domain/grading/grading-assistant-invocation';
import { redirectWithToast } from '~/utils/toast.server';
import {
  extractJsonObjectCandidates,
  parseFirstJsonValue,
} from '~/utils/llm-json.server';
import {
  buildAiContextAuditMetadata,
  buildAiTextContextAudit,
} from '~/utils/ai-context-audit.server';
import {
  buildTeacherClassWhere,
  buildGradeWriteSubjectWhere,
  canManageGrades,
  getGradingActor,
  isGradingOwnDocument,
} from '~/utils/grading-auth.server';
import {
  isApHistorySnapshot,
  parseApHistorySnapshot,
  apHistoryCourseLabel,
  type ApHistorySnapshot,
} from '~/domain/ap-history/schema';
import {
  createGradingRequestDeadlineSignal,
  isGradingRequestDeadlineError,
  runWithGradingRequestDeadline,
} from './grading-request-deadline.server';
import {
  buildSubmissionActivityChanges,
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';
import { maybePostGradeToBlackboard } from '~/integrations/blackboard-ags.server';
import { enforceGradingLimits, rateLimitedJson } from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import type {
  ApHistoryDbqPointKey,
  ApHistoryLeqPointKey,
} from '~/domain/ap-history/rubric';

const POST = z.object({
  documentId: z.string().optional(),
  submissionId: z.string().optional(),
  gradingAssistantStrictnessLevel: z.string().optional(),
  llmRetry: z.enum(['fallback']).optional(),
  e2eForceGradingFixture: z.literal('true').optional(),
});

function isPrismaRecordNotFoundError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

export function getRubricEvaluationMaxTokens(categoryCount: number) {
  const baseCategoryCount = 5;
  const baseMaxTokens = 900;
  const tokensPerAdditionalCategory = 300;

  return Math.min(
    2400,
    baseMaxTokens +
      Math.max(0, categoryCount - baseCategoryCount) *
        tokensPerAdditionalCategory
  );
}

function buildAiSchemas({
  rubricCategories,
  minScore,
  maxScore,
  categoryFeedbackEnabled = true,
  teacherNotesEnabled = false,
  gradingMode,
  grammarHighlightMode,
}: {
  rubricCategories: GradingRubricCategory[];
  minScore: number;
  maxScore: number;
  /**
   * When the rubric wants overall feedback only, the model is never asked for a
   * per-category comment, so one must not be required back. A comment it sends
   * anyway is still kept.
   */
  categoryFeedbackEnabled?: boolean;
  teacherNotesEnabled?: boolean;
  gradingMode?: 'step' | 'bands';
  grammarHighlightMode?: 'off' | 'highlight' | 'deduct';
}) {
  const rubricKeys = rubricCategories.map((category) => category.key);
  const categoryByKey = new Map(
    rubricCategories.map((category) => [category.key, category])
  );
  const RubricKeySchema = z.enum(rubricKeys as [string, ...string[]]);
  const AiCategorySchema = z.object({
    key: RubricKeySchema,
    score: z.number().int().min(minScore).max(maxScore),
    comment: categoryFeedbackEnabled
      ? z.string().min(1)
      : z.string().optional().default(''),
    ...(grammarHighlightMode === 'highlight'
      ? { grammarImpairsMeaning: z.boolean().optional() }
      : {}),
  });
  const AiCategoriesSchema = z
    .array(AiCategorySchema)
    .superRefine((categories, ctx) => {
      if (categories.length !== rubricKeys.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Expected ${rubricKeys.length} rubric categories, received ${categories.length}.`,
        });
      }

      const seen = new Set<string>();
      for (const category of categories) {
        if (seen.has(category.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate rubric category key: ${category.key}`,
          });
          continue;
        }
        seen.add(category.key);
        const configuredCategory = categoryByKey.get(category.key);
        if (
          configuredCategory &&
          (
            !isScoreInCategoryBands(configuredCategory, category.score) ||
            (gradingMode === 'step' &&
              !isScoreInCategoryAllowedScores(configuredCategory, category.score))
          )
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Score ${category.score} is outside the declared bands for ${category.key}.`,
          });
        }
      }

      for (const key of rubricKeys) {
        if (!seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Missing rubric category key: ${key}`,
          });
        }
      }
    });
  const AiResponseSchema = z.object({
    categories: AiCategoriesSchema,
    overallComment: z.string().min(1),
    teacherNote: z.unknown().optional().transform(value => teacherNotesEnabled ? normalizeTeacherNote(value) : null),
  });

  return { AiCategoriesSchema, AiResponseSchema };
}

const AiOverallCommentSchema = z.object({
  overallComment: z.string().min(1),
});

// Scoring order, which is not the display order used on the assignment type
// page. The `satisfies` ties both lists to the rubric shown to teachers and
// students, so renaming a point key there fails the typecheck here rather than
// silently grading a row nobody sees.
const apHistoryDbqPointKeys = [
  'thesis',
  'contextualization',
  'document_use_describes',
  'document_use_supports_argument',
  'outside_evidence',
  'sourcing',
  'complexity',
] as const satisfies readonly ApHistoryDbqPointKey[];

const apHistoryLeqPointKeys = [
  'thesis',
  'contextualization',
  'evidence',
  'analysis_reasoning',
  'complexity',
  'supporting_evidence',
] as const satisfies readonly ApHistoryLeqPointKey[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function apHistoryPointKeysForSnapshot(snapshot: ApHistorySnapshot) {
  return snapshot.essayType === 'dbq'
    ? apHistoryDbqPointKeys
    : apHistoryLeqPointKeys;
}

function normalizeApHistoryPoints(
  snapshot: ApHistorySnapshot,
  points: Record<string, unknown>
) {
  return Object.fromEntries(
    apHistoryPointKeysForSnapshot(snapshot).map((key) => {
      const point = points[key];
      const normalizedPoint = isRecord(point)
        ? {
            earned: point.earned === true,
            comment: typeof point.comment === 'string' ? point.comment : '',
          }
        : { earned: false, comment: '' };

      return [key, normalizedPoint];
    })
  ) as Prisma.InputJsonObject;
}

function countApHistoryEarnedPoints(
  snapshot: ApHistorySnapshot,
  points: Record<string, unknown>
) {
  const pointKeys = apHistoryPointKeysForSnapshot(snapshot);
  const earnedPoints = pointKeys.reduce((count, key) => {
    const point = points[key];
    if (!isRecord(point)) return count;
    return point.earned === true ? count + 1 : count;
  }, 0);

  return Math.min(earnedPoints, snapshot.rubric.totalPoints);
}

function buildApHistoryPrompt({
  snapshot,
  essayText,
  studentFirstName,
}: {
  snapshot: ApHistorySnapshot;
  essayText: string;
  studentFirstName: string;
}) {
  const essayType = snapshot.essayType.toUpperCase();
  const pointKeys = apHistoryPointKeysForSnapshot(snapshot).join(', ');
  const sources =
    snapshot.essayType === 'dbq'
      ? snapshot.sources
          .map((source) => {
            const caption = source.caption
              ? `\nCaption: ${source.caption}`
              : '';
            return `Document ${source.position}: ${source.title}\nAttribution: ${source.attribution}${caption}\nBody: ${source.body}`;
          })
          .join('\n\n')
      : 'No DBQ documents apply to this LEQ.';

  return `Student first name: ${studentFirstName}

AP History assignment: ${apHistoryCourseLabel(snapshot.course)} ${essayType}
Course: ${apHistoryCourseLabel(snapshot.course)}
Essay type: ${essayType}
Assignment prompt: ${snapshot.prompt}
Period: ${snapshot.period} (Period ${snapshot.periodNumber})
Reasoning skill: ${snapshot.reasoningSkill}
Rubric: ${snapshot.rubric.rubricId}
Total points: ${snapshot.rubric.totalPoints}
Point keys to score: ${pointKeys}

DBQ source list:
${sources}

Essay:
${essayText}`;
}

const e2eRubricFixtures: Record<string, { score: number; comment: string }> = {
  thesis_and_content: {
    score: 5,
    comment: 'Legacy thesis feedback from deterministic E2E.',
  },
  organization_and_structure: {
    score: 4,
    comment: 'Legacy organization feedback from deterministic E2E.',
  },
  evidence_and_support: {
    score: 3,
    comment: 'Legacy evidence feedback from deterministic E2E.',
  },
  voice_and_style: {
    score: 4,
    comment: 'Legacy voice feedback from deterministic E2E.',
  },
  grammar_and_mechanics: {
    score: 2,
    comment: 'Legacy grammar feedback from deterministic E2E.',
  },
};

function shouldUseE2EGradingFixture(
  request: Request,
  forceFromForm: boolean
) {
  if (
    process.env.E2E !== 'true' ||
    process.env.E2E_GRADE_ESSAY_AI_FIXTURE !== 'true'
  ) {
    return false;
  }
  if (
    forceFromForm ||
    request.headers.get('x-e2e-force-grade-essay-ai-fixture') === 'true'
  ) {
    return true;
  }
  return !process.env.ANTHROPIC_API_KEY;
}

function buildE2EGradingFixtureResponse({
  rubricCategories,
  minScore,
  maxScore,
  studentFirstName,
  categoryFeedbackEnabled,
  scoringMode = 'weighted_categories',
  assignmentPointTotal = null,
}: {
  rubricCategories: GradingRubricCategory[];
  minScore: number;
  maxScore: number;
  studentFirstName: string;
  categoryFeedbackEnabled: boolean;
  scoringMode?: 'weighted_categories' | 'holistic_tier';
  assignmentPointTotal?: number | null;
}) {
  const payload: Record<string, unknown> = {
    categories: rubricCategories.map((category) => {
      const fixture = e2eRubricFixtures[category.key] ?? {
        score: maxScore,
        comment: `Deterministic E2E feedback for ${category.label}.`,
      };
      return {
        key: category.key,
        score: Math.max(minScore, Math.min(maxScore, fixture.score)),
        // A rubric that wants overall feedback only never gets asked for a
        // per-category comment, so the fixture must not invent one either.
        ...(categoryFeedbackEnabled ? { comment: fixture.comment } : {}),
      };
    }),
    overallComment: `${studentFirstName}, these legacy grading assistant suggestions still apply.`,
  };
  if (
    scoringMode === 'holistic_tier' &&
    typeof assignmentPointTotal === 'number' &&
    Number.isFinite(assignmentPointTotal) &&
    assignmentPointTotal > 0
  ) {
    payload.overallTier = 'excellent';
    payload.overallPoints = Math.round(0.9 * assignmentPointTotal);
  }
  return JSON.stringify(payload);
}

function extractHolisticFieldsFromRecord(value: unknown) {
  if (!isRecord(value)) return null;
  const maybePoints = value.overallPoints;
  const maybeTier = value.overallTier;
  if (
    (typeof maybePoints === 'number' || typeof maybePoints === 'string') &&
    typeof maybeTier === 'string'
  ) {
    const points = Number(maybePoints);
    if (!Number.isFinite(points)) return null;
    return { overallPoints: points, overallTier: maybeTier };
  }
  return null;
}

function withPreservedHolisticFields<T extends object>(
  base: T,
  ...sources: unknown[]
) {
  for (const source of sources) {
    const holistic = extractHolisticFieldsFromRecord(source);
    if (holistic) return { ...base, ...holistic };
  }
  return base;
}

function computeWeightedPercentageForCategories({
  rubricScores,
  categories,
}: {
  rubricScores: Record<string, unknown> | null | undefined;
  categories: GradingRubricCategory[];
}) {
  if (!rubricScores || typeof rubricScores !== 'object') return null;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const category of categories) {
    const value = (rubricScores as Record<string, { score?: unknown }>)[
      category.key
    ];
    const score = value?.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) return null;
    const percent = scoreToPercent(score);
    if (percent === null) return null;
    totalWeight += category.weight;
    weightedSum += percent * category.weight;
  }

  if (totalWeight <= 0) return null;
  return Math.round(weightedSum / totalWeight);
}

function computeLegacyGradeFields({
  categories,
  rubricScores,
  rubricCategories,
}: {
  categories: Array<{ score: number }>;
  rubricScores: Record<string, Prisma.InputJsonValue>;
  rubricCategories: GradingRubricCategory[];
}) {
  const average =
    categories.reduce((sum, item) => sum + item.score, 0) / categories.length;
  const overallScore = Math.round(average);
  const numericPercentage = computeWeightedPercentageForCategories({
    rubricScores: rubricScores as unknown as Record<string, unknown>,
    categories: rubricCategories,
  });
  const letterGrade =
    numericPercentage !== null ? letterFromPercent(numericPercentage) : null;
  const score = formatGrade(numericPercentage, letterGrade);

  return { overallScore, numericPercentage, letterGrade, score };
}

/**
 * The overall grade for a rubric whose categories declare their own bands.
 *
 * Nothing is converted: the categories are scored inside the bands the rubric
 * writes, so the weighted average of those scores is the grade.
 */
function computeBandScoredGradeFields({
  rubricScores,
  rubricCategories,
}: {
  rubricScores: Record<string, Prisma.InputJsonValue>;
  rubricCategories: GradingRubricCategory[];
}) {
  const numericPercentage = computeWeightedBandPercentage(
    rubricScores as unknown as Record<string, unknown>,
    rubricCategories
  );
  if (numericPercentage === null) return null;

  const letterGrade = letterFromPercent(numericPercentage);

  return {
    overallScore: numericPercentage,
    numericPercentage,
    letterGrade,
    score: formatGrade(numericPercentage, letterGrade) ?? '',
  };
}

function buildDynamicGradeFields({
  categories,
  rubricScores,
  scoringType,
  maxScore,
  rubricCategories,
  bandScored,
}: {
  categories: Array<{ score: number }>;
  rubricScores: Record<string, Prisma.InputJsonValue>;
  scoringType: string;
  maxScore: number;
  rubricCategories: GradingRubricCategory[];
  bandScored: boolean;
}) {
  // Bands define valid category scores; the scoring type determines whether
  // the result is raw points or a percentage. Daily Pages remains 18/30.
  const nonLegacy = rubricScaleGradeFields({ categories, scoringType, maxScore });
  if (nonLegacy) return nonLegacy;

  if (bandScored) {
    const banded = computeBandScoredGradeFields({ rubricScores, rubricCategories });
    if (banded) return banded;
  }

  return computeLegacyGradeFields({
    categories,
    rubricScores,
    rubricCategories,
  });
}

function applyStrictnessToGradeFields({
  overallScore,
  numericPercentage,
  letterGrade,
  score,
  scoringType,
  gradingAssistantStrictnessLevel,
}: {
  overallScore: number;
  numericPercentage: number | null;
  letterGrade: string | null;
  score: string | null;
  scoringType: string;
  gradingAssistantStrictnessLevel: GradingAssistantStrictnessLevel;
}) {
  if (scoringType === ACT_WRITING_SCORING_TYPE) {
    const adjustedComposite = applyGradingAssistantStrictnessToActComposite(
      overallScore,
      gradingAssistantStrictnessLevel
    );
    return {
      overallScore: adjustedComposite,
      numericPercentage,
      letterGrade,
      score: `${adjustedComposite}/12`,
    };
  }

  if (numericPercentage === null) {
    return { overallScore, numericPercentage, letterGrade, score };
  }

  const adjustedPercentage = applyGradingAssistantStrictnessToPercentage(
    numericPercentage,
    gradingAssistantStrictnessLevel
  );
  const adjustedLetterGrade = letterFromPercent(adjustedPercentage);
  return {
    overallScore,
    numericPercentage: adjustedPercentage,
    letterGrade: adjustedLetterGrade,
    score: formatGrade(adjustedPercentage, adjustedLetterGrade) ?? score,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  // Per-teacher throttle (minute, 10-min, hour/day, global)
  const gradingDeadlineSignal = createGradingRequestDeadlineSignal();
  const gradingDeadlineResponse = () =>
    dataResponse(
      {
        success: false,
        code: 'GRADING_REQUEST_TIMEOUT',
        message: 'Grading took too long. Please try again.',
      },
      { status: 504 }
    );
  const staleGradeResponse = () =>
    dataResponse(
      {
        success: false,
        message:
          'This submission changed before the grading suggestions could be saved. Please refresh and try again.',
      },
      { status: 409 }
    );

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);
  if (!data.documentId && !data.submissionId) {
    return dataResponse(
      { success: false, message: 'A document or submission is required.' },
      { status: 400 }
    );
  }

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can grade essays.' },
      { status: 403 }
    );
  }
  {
    const decision = await enforceGradingLimits({
      request,
      membershipId: actor.membershipId,
      route: '/api/domain/grade-essay-ai',
    });
    if (!decision.allowed) {
      return rateLimitedJson(decision.scope, decision.retryAfterSeconds, 'Please wait before grading more submissions.');
    }
  }

  const teacherClassWhere = buildTeacherClassWhere(actor);

  // Look up the submission — either by submissionId directly or by finding
  // the latest submission for the given documentId.
  const submissionSelect = {
    id: true,
    text: true,
    html: true,
    updatedAt: true,
    gradedAt: true,
    gradedByMembershipId: true,
    releasedAt: true,
    unsubmittedAt: true,
    score: true,
    feedback: true,
    rubricScores: true,
    overallScore: true,
    overallComment: true,
    numericPercentage: true,
    letterGrade: true,
    grammarIssues: true,
    document: {
      select: {
        id: true,
        membershipId: true,
        assignmentTypeId: true,
        // Only to tell a group brief from a solo essay when deciding who the
        // feedback is addressed to; see `gradingAddressee`.
        group: { select: { label: true, members: { where: { removedAt: null }, select: { membershipId: true, membership: { select: { userId: true } } } } } },
        apHistorySnapshot: true,
        assignmentType: {
          select: {
            id: true,
            kind: true,
            title: true,
          },
        },
        assignment: {
          select: {
            id: true,
            gradingAssistantStrictnessLevel: true,
            grammarGradingEnabled: true,
            tutorEnabled: true,
            apHistorySnapshot: true,
            prompt: true,
            pointValue: true,
            exitTicketConfigJson: true,
          },
        },
        classAssignment: {
          select: {
            class: {
              select: {
                id: true,
                schoolId: true,
                school: {
                  select: {
                    organizationId: true,
                    organization: {
                      select: { submissionActivityEnabled: true },
                    },
                  },
                },
                teachers: { select: { id: true } },
              },
            },
          },
        },
        membership: {
          select: {
            userId: true,
            organizationId: true,
            organization: {
              select: { submissionActivityEnabled: true },
            },
            classesAsStudent: {
              select: {
                id: true,
                schoolId: true,
                school: { select: { organizationId: true } },
                teachers: { select: { id: true } },
              },
            },
            user: { select: { name: true } },
          },
        },
      },
    },
  } as const;

  const submission = data.submissionId
    ? await prisma.submission.findFirst({
        where: {
          id: data.submissionId,
          document: {
            is: {
              deletedAt: null,
              ...teacherClassWhere,
            },
          },
        },
        select: submissionSelect,
      })
    : await prisma.submission.findFirst({
        where: {
          documentId: data.documentId,
          document: {
            is: {
              deletedAt: null,
              ...teacherClassWhere,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        select: submissionSelect,
      });

  if (!submission?.id) {
    console.warn('grade-essay-ai submission not found', {
      submissionId: data.submissionId ?? null,
      documentId: data.documentId ?? null,
      membershipId: actor.membershipId,
      isAdmin: actor.isAdmin,
    });
    return dataResponse(
      { success: false, message: 'Submitted essay not found.' },
      { status: 404 }
    );
  }

  if (
    isGradingOwnDocument(
      actor.membershipId,
      submission.document.membershipId,
      actor.userId,
      submission.document.membership?.userId
    ) || submission.document.group?.members.some((member) =>
      member.membershipId === actor.membershipId || member.membership.userId === actor.userId
    )
  ) {
    return dataResponse(
      {
        success: false,
        message: 'You cannot run AI grading on your own submission.',
      },
      { status: 403 }
    );
  }

  if (!submission.text?.trim()) {
    console.warn('grade-essay-ai submission text missing', {
      submissionId: submission.id,
      documentId: submission.document.id,
    });
    return dataResponse(
      { success: false, message: 'Submitted essay text not found.' },
      { status: 404 }
    );
  }

  const organizationId =
    submission.document.classAssignment?.class?.school?.organizationId ??
    submission.document.membership?.organizationId ??
    actor.organizationId;
  const gradeActorMembershipId = resolveSubmissionActivityActorMembershipId({
    actorMembershipId: actor.membershipId,
    actorOrganizationId: actor.organizationId,
    submissionOrganizationId: organizationId,
  });
  if (
    submission.releasedAt != null &&
    (submission.document.classAssignment?.class?.school?.organization
      ?.submissionActivityEnabled ??
      submission.document.membership?.organization
        ?.submissionActivityEnabled) !== true
  ) {
    return dataResponse(
      {
        success: false,
        message: 'Released grades are read-only for this organization.',
      },
      { status: 403 }
    );
  }

  const resolvedGradingConfig = scaleDailyPagesForAssignment(
    await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: submission.document.assignmentTypeId,
      assignmentId: submission.document.assignment?.id,
      assignmentTypeKind: submission.document.assignmentType?.kind ?? null,
      assignmentTypeTitle: submission.document.assignmentType?.title ?? null,
    }),
    submission.document.assignment?.pointValue,
  );
  const requestedStrictnessLevel = data.gradingAssistantStrictnessLevel
    ? parseGradingAssistantStrictnessLevel(data.gradingAssistantStrictnessLevel)
    : null;
  if (data.gradingAssistantStrictnessLevel && !requestedStrictnessLevel) {
    return dataResponse(
      {
        success: false,
        message: 'Grading assistant strictness level is invalid.',
      },
      { status: 400 }
    );
  }
  const assignmentStrictnessLevel = parseGradingAssistantStrictnessLevel(
    submission.document.assignment?.gradingAssistantStrictnessLevel
  );
  const gradingAssistantStrictnessLevel =
    requestedStrictnessLevel ??
    assignmentStrictnessLevel ??
    DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL;
  const assignmentGrammarGradingEnabled =
    submission.document.assignment?.grammarGradingEnabled;
  const displayOptions = resolveDisplayOptions(
    resolvedGradingConfig.outputSchemaSnapshot,
    resolvedGradingConfig.rubricCategories,
    { grammarGradingEnabled: assignmentGrammarGradingEnabled }
  );
  // Grammar-off (assignment or rubric display) drops grammar categories here once.
  const rubricCategories = applyDisplayGrammarCategories(
    resolvedGradingConfig.rubricCategories,
    resolvedGradingConfig.outputSchemaSnapshot,
    { grammarGradingEnabled: assignmentGrammarGradingEnabled }
  );
  const rubricKeys = rubricCategories.map((category) => category.key);
  const { minScore, maxScore, step, scoringType } = resolvedGradingConfig;
  const rubricConfig = {
    categories: rubricCategories,
    minScore,
    maxScore,
    // Without the step the panel rebuilds its score picker from the raw range,
    // so a 0-30 scale scored in tens offers all thirty-one values the moment
    // the grading assistant returns.
    step,
    scoringType,
    source: resolvedGradingConfig.source,
    ...(resolvedGradingConfig.scoringMode
      ? { scoringMode: resolvedGradingConfig.scoringMode }
      : {}),
  };
  const gradingInstructionsOverride =
    typeof resolvedGradingConfig.promptConfigSnapshot
      .gradingInstructionsOverride === 'string'
      ? resolvedGradingConfig.promptConfigSnapshot.gradingInstructionsOverride.trim()
      : '';
  // A group brief is addressed to the group. `Document.membershipId` names
  // whichever member is first in it, so addressing the student here put one
  // name on feedback about work the whole group wrote.
  const studentFirstName = gradingAddressee({
    studentName: submission.document.membership?.user?.name,
    groupLabel: submission.document.group?.label,
  });
  // The prompt is derived from the rubric itself: how many judgments it asks
  // for, which words each score carries, and whether it wants per-category
  // feedback or overall feedback alone. No assignment type is named here.
  const teacherNotesEnabled = hasTeacherNotes(
    resolvedGradingConfig.outputSchemaSnapshot,
    displayOptions
  );
  const promptShape = buildGradingPromptShape({
    categories: rubricCategories,
    minScore,
    maxScore,
    studentFirstName,
    teacherNotesEnabled,
    gradingMode: resolvedGradingConfig.gradingMode,
    display: displayOptions,
    outputSchema: resolvedGradingConfig.outputSchemaSnapshot,
  });
  const categoryFeedbackEnabled = promptShape.categoryFeedbackEnabled;
  const { AiCategoriesSchema, AiResponseSchema } = buildAiSchemas({
    rubricCategories,
    minScore,
    maxScore,
    categoryFeedbackEnabled,
    teacherNotesEnabled,
    gradingMode: resolvedGradingConfig.gradingMode,
    grammarHighlightMode: displayOptions.grammarHighlight,
  });

  const assignmentPrompt = submission.document.assignment?.prompt?.trim();
  // How to read the rubric for this ticket, plus whatever the teacher said the
  // lesson covered. Null for every other assignment, leaving the payload
  // exactly as it was.
  const gradingContext = buildExitTicketGradingContext(
    parseStoredExitTicketConfig(
      submission.document.assignment?.exitTicketConfigJson
    )
  );

  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';
  // llmRetry=fallback is the client half of the provider-failover handshake
  // (the server answers 202 {retrying:true}, the client re-posts with it). It
  // only selects the fallback model, and every request is rate limited above, so
  // it stays honoured; ignoring it makes failover unreachable during an outage.
  const forceFallback = data.llmRetry === 'fallback';
  const llmRetryOptions = {
    forceFallback,
    signalFallbackRetry: !forceFallback,
  };
  const retryResponse = () => dataResponse({ retrying: true }, { status: 202 });
  // Cap total LLM calls per submission processing
  let llmCallCount = 0;
  const getGradingLlmCompletion = (
    params: Omit<Parameters<typeof getLLMCompletion>[0], 'attribution'>
  ) =>
    runWithGradingRequestDeadline(gradingDeadlineSignal, async (signal) => {
      llmCallCount += 1;
      if (llmCallCount > RATE_LIMITS.grading.maxLlmCallsPerSubmission) {
        // 429 with Retry-After 60s default
        throw new Response(
          JSON.stringify({
            error: {
              code: 'RATE_LIMITED',
              scope: 'user',
              retryAfterSeconds: 60,
              message: 'This grading request used too many model calls. Please try again.',
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
        );
      }
      return getLLMCompletion({
        ...params,
        ...llmRetryOptions,
        signal,
        attribution: {
          organizationId,
          membershipId: actor.membershipId,
          route: 'routes/api.domain.grade-essay-ai',
          requestId: crypto.randomUUID(),
          ipHash: computeIpHash(request),
        },
      });
    });
  const holisticE2eFixture =
    process.env.E2E === 'true' &&
    process.env.E2E_GRADE_ESSAY_AI_FIXTURE === 'true' &&
    (resolvedGradingConfig.scoringMode ?? 'weighted_categories') ===
      'holistic_tier';
  const useE2EFixture =
    holisticE2eFixture ||
    shouldUseE2EGradingFixture(
      request,
      data.e2eForceGradingFixture === 'true'
    );
  const documentContext = buildAiTextContextAudit({
    documentSource: 'submission-snapshot',
    documentId: submission.document.id,
    submissionId: submission.id,
    text: submission.text,
  });
  const gradingAiContextMetadata = buildAiContextAuditMetadata({
    textContext: documentContext,
    assignmentTypeId: submission.document.assignmentTypeId,
    assignmentTypeRubricSource: resolvedGradingConfig.source,
    assignmentTypeGradingVersion: resolvedGradingConfig.version,
    rubricCategoryKeys: rubricKeys,
  });

  const apHistorySnapshotCandidate =
    submission.document.apHistorySnapshot ??
    submission.document.assignment?.apHistorySnapshot;
  const apHistorySnapshot = isApHistorySnapshot(apHistorySnapshotCandidate)
    ? parseApHistorySnapshot(apHistorySnapshotCandidate)
    : null;

  if (apHistorySnapshot) {
    const apSystem = `You are the AP History Grading Assistant. Return ONLY valid JSON with the schema:
{
  "rubricVersion": "${apHistorySnapshot.rubric.rubricId}",
  "points": {"point_key": {"earned": boolean, "comment": string}},
  "overallComment": string
}
Grade the ${apHistoryCourseLabel(apHistorySnapshot.course)} ${apHistorySnapshot.essayType.toUpperCase()} using the supplied immutable assignment snapshot and AP point-style rubric.
Use only evidence from the essay and snapshot.
For DBQ, score these point keys: ${apHistoryDbqPointKeys.join(', ')}.
For LEQ, score these point keys: ${apHistoryLeqPointKeys.join(', ')}.
In overallComment, start with "${studentFirstName}," and continue with concise, actionable AP History feedback.`;

    const apUserPromptBase = buildApHistoryPrompt({
      snapshot: apHistorySnapshot,
      essayText: submission.text,
      studentFirstName,
    });
    const apUserPrompt = gradingInstructionsOverride
      ? `${apUserPromptBase}\n\nGrading instructions:\n${gradingInstructionsOverride}`
      : apUserPromptBase;

    let parsedJson: Record<string, unknown>;
    let points: Prisma.InputJsonObject;
    try {
      const apResponseText = await getGradingLlmCompletion({
        model,
        system: apSystem,
        messages: [{ role: 'user', content: apUserPrompt }],
        maxTokens: 1200,
        temperature: 0.2,
        metadata: {
          feature: 'grading',
          kind: 'ap-history-rubric',
          rubricId: apHistorySnapshot.rubric.rubricId,
          essayType: apHistorySnapshot.essayType,
          ...buildAiContextAuditMetadata({
            textContext: documentContext,
            assignmentTypeId: submission.document.assignmentTypeId,
            assignmentTypeRubricSource: 'ap-history-snapshot',
            rubricCategoryKeys: [
              ...apHistoryPointKeysForSnapshot(apHistorySnapshot),
            ],
          }),
        },
      });

      const parsedJsonCandidate = parseFirstJsonValue(apResponseText);
      if (
        !isRecord(parsedJsonCandidate) ||
        !isRecord(parsedJsonCandidate.points)
      ) {
        throw new Error('Malformed AP History grading assistant response');
      }

      parsedJson = parsedJsonCandidate;
      points = normalizeApHistoryPoints(
        apHistorySnapshot,
        parsedJsonCandidate.points
      );
    } catch (error) {
      if (isGradingRequestDeadlineError(error)) {
        return gradingDeadlineResponse();
      }
      if (isLlmFallbackRetrySignal(error)) return retryResponse();
      return dataResponse(
        {
          success: false,
          message:
            'Grading Assistant returned malformed data. Please try again.',
        },
        { status: 502 }
      );
    }

    const earnedPoints = countApHistoryEarnedPoints(apHistorySnapshot, points);
    const totalPoints = apHistorySnapshot.rubric.totalPoints;
    const rubricScores = {
      schemaVersion: 1,
      rubricId: apHistorySnapshot.rubric.rubricId,
      totalPoints,
      earnedPoints,
      points,
    } satisfies Prisma.InputJsonObject;
    const { numericPercentage, letterGrade, score, overallScore } =
      applyStrictnessToGradeFields({
        overallScore: earnedPoints,
        numericPercentage: Math.round((earnedPoints / totalPoints) * 100),
        letterGrade: letterFromPercent(
          Math.round((earnedPoints / totalPoints) * 100)
        ),
        score:
          formatGrade(
            Math.round((earnedPoints / totalPoints) * 100),
            letterFromPercent(Math.round((earnedPoints / totalPoints) * 100))
          ) ?? '',
        scoringType: 'percentage',
        gradingAssistantStrictnessLevel,
      });
    const overallComment =
      typeof parsedJson.overallComment === 'string' &&
      parsedJson.overallComment.trim()
        ? parsedJson.overallComment
        : `${studentFirstName}, your AP History response has been scored with the ${apHistorySnapshot.rubric.rubricId} rubric.`;
    const grammarIssues = null;
    const now = new Date();

    if (gradingDeadlineSignal.aborted) {
      return gradingDeadlineResponse();
    }

    const apGradeData = {
      rubricScores,
      overallScore,
      overallComment,
      numericPercentage,
      letterGrade,
      score,
      aiMeta: {
        model,
        rubricMode: 'ap_history',
        gradingAssistantStrictnessLevel,
        gradedAt: now.toISOString(),
        documentContext,
      } satisfies Prisma.InputJsonValue,
      ...(!submission.gradedAt
        ? { gradedAt: now, gradedByMembershipId: gradeActorMembershipId }
        : {}),
      updatedAt: now,
    };
    try {
      await prisma.$transaction(async (tx) => {
        await tx.submission.update({
          where: {
            id: submission.id,
            updatedAt: submission.updatedAt,
            unsubmittedAt: null,
            document: {
              is: {
                deletedAt: null,
                AND: [
                  buildGradeWriteSubjectWhere({
                    actorUserId: actor.userId,
                    releasedAt: submission.releasedAt,
                  }),
                  teacherClassWhere,
                ],
              },
            },
          },
          data: apGradeData,
        });
        await recordSubmissionActivity(tx, {
          submissionId: submission.id,
          organizationId,
          actorMembershipId: gradeActorMembershipId,
          actorUserId: actor.userId,
          eventType: submissionActivityEventTypes.gradingAssistantUpdated,
          source: 'grade-essay-ai',
          occurredAfterRelease: submission.releasedAt != null,
          changes: buildSubmissionActivityChanges({
            before: submission,
            after: { ...submission, ...apGradeData },
          }),
          metadata: {
            model,
            rubricMode: 'ap_history',
            rubricId: apHistorySnapshot.rubric.rubricId,
            gradedAt: now.toISOString(),
          },
        });
      });
    } catch (error) {
      if (isPrismaRecordNotFoundError(error)) return staleGradeResponse();
      throw error;
    }

    // Dev-only: attempt Blackboard mock AGS passback when configured
    try {
      await maybePostGradeToBlackboard({ numericPercentage });
    } catch (error) {
      console.warn('Blackboard AGS passback (mock) failed', { error });
    }

    return dataResponse({
      success: true,
      message: 'Grading Assistant suggestions generated.',
      rubricScores,
      overallScore,
      overallComment,
      numericPercentage,
      letterGrade,
      score,
      grammarIssues,
    });
  }

  const explicitGrammarHighlight = readOutputSchemaDisplay(
    resolvedGradingConfig.outputSchemaSnapshot
  )?.grammarHighlight;
  const compiledInvocation = compileGradingAssistantInvocation({
    gradingConfig: resolvedGradingConfig,
    studentFirstName,
    strictnessLevel: gradingAssistantStrictnessLevel,
    documentText: submission.text,
    assignmentPrompt,
    gradingContext,
    coldWrite: submission.document.assignment?.tutorEnabled === false,
    assignmentPointTotal: submission.document.assignment?.pointValue ?? null,
    ...(explicitGrammarHighlight
      ? {
          assignmentGrammarGradingEnabled,
          rubricCategories,
        }
      : {}),
  });
  const { system, maxTokens } = compiledInvocation;
  const rubricEvaluationMaxTokens = getRubricEvaluationMaxTokens(
    rubricKeys.length
  );

  let responseText = '';

  if (useE2EFixture) {
    responseText = buildE2EGradingFixtureResponse({
      rubricCategories,
      minScore,
      maxScore,
      studentFirstName,
      categoryFeedbackEnabled,
      scoringMode: resolvedGradingConfig.scoringMode ?? 'weighted_categories',
      assignmentPointTotal: submission.document.assignment?.pointValue ?? null,
    });
  } else {
    try {
      responseText = await getGradingLlmCompletion({
        model,
        system,
        messages: compiledInvocation.messages,
        maxTokens,
        metadata: {
          feature: 'grading',
          kind: 'rubric-evaluation',
          gradingConfigSource: resolvedGradingConfig.source,
          ...gradingAiContextMetadata,
          assignmentTypeGradingLabel: resolvedGradingConfig.label,
          assignmentTypeSourceTemplateId:
            resolvedGradingConfig.sourceTemplateId,
          assignmentTypeSourceTemplateSlug:
            resolvedGradingConfig.sourceTemplateSlug,
          gradingAssistantStrictnessLevel,
          assignmentTypeKind: submission.document.assignmentType?.kind ?? null,
        },
      });
    } catch (error) {
      if (isGradingRequestDeadlineError(error)) {
        return gradingDeadlineResponse();
      }
      if (error instanceof Response && error.status === 429) return error;
      if (isLlmFallbackRetrySignal(error)) return retryResponse();
      throw error;
    }
  }

  // Retry prompts must retain authored constraints even when a managed
  // template placed them only in its system message. Keep this separate from
  // any model output, particularly the private note.
  const authoredGradingConstraints = [
    resolvedGradingConfig.instructions.systemInstructions,
    ...(resolvedGradingConfig.instructions.mode === 'unified'
      ? [resolvedGradingConfig.instructions.gradingInstructions]
      : [resolvedGradingConfig.instructions.rubricInstructions, resolvedGradingConfig.instructions.scoreInstructions]),
  ].filter(Boolean).join('\n\n');

  const buildAiResponseFromCategories = async (
    categories: z.infer<typeof AiCategoriesSchema>,
    teacherNote: string | null
  ) => {
    const overallCommentResponseText = await getGradingLlmCompletion({
      model,
      system: `You write the overall feedback sentence for a grading assistant. Return ONLY valid JSON with the schema:\n{\n  "overallComment": string\n}\nRules:\n- overallComment must start with "${studentFirstName},".\n- Keep it warm, professional, and cohesive.\n- Do not include markdown or explanation.\n- ${overallCommentWriterRules(teacherNotesEnabled)}`,
      messages: [
        {
          role: 'user',
          content: `Authored grading constraints:\n${authoredGradingConstraints}\n\n${compiledInvocation.userMessage}\n\nRubric category feedback:\n${JSON.stringify(categories)}`,
        },
      ],
      maxTokens: 300,
      temperature: 0.2,
      metadata: {
        feature: 'grading',
        kind: 'overall-comment',
        ...gradingAiContextMetadata,
      },
    });
    const parsedOverallComment = AiOverallCommentSchema.parse(
      parseFirstJsonValue(overallCommentResponseText)
    );

    return {
      categories,
      overallComment: parsedOverallComment.overallComment,
      teacherNote,
    };
  };

  const extractCategories = (
    value: unknown
  ): z.infer<typeof AiCategoriesSchema> | null => {
    const categoriesCandidate = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? (value as { categories?: unknown }).categories
        : null;
    const parsedCategories = AiCategoriesSchema.safeParse(categoriesCandidate);
    return parsedCategories.success ? parsedCategories.data : null;
  };

  const tryParseAiResponse = (value: unknown) => {
    const parsedResponse = AiResponseSchema.safeParse(value);
    if (parsedResponse.success) return parsedResponse.data;

    const categories = extractCategories(value);
    if (!categories) return null;

    return { categories, overallComment: null, teacherNote: teacherNotesEnabled && isRecord(value) ? normalizeTeacherNote(value.teacherNote) : null };
  };

  const repairPrivateObservationRules =
    gradingRepairPrivateObservationRules(teacherNotesEnabled);

  const parseAiResponse = async (rawResponseText: string) => {
    const parsedJson = parseFirstJsonValue(rawResponseText);
    const parsed = tryParseAiResponse(parsedJson);
    if (parsed?.overallComment) {
      return withPreservedHolisticFields(parsed, parsedJson) as typeof parsed;
    }
    if (parsed?.categories) {
      const built = await buildAiResponseFromCategories(
        parsed.categories,
        parsed.teacherNote
      );
      return withPreservedHolisticFields(built, parsedJson) as typeof built;
    }

    const repairedResponseText = await getGradingLlmCompletion({
      model,
      system: `You repair grading assistant JSON. Return ONLY valid JSON with the schema:\n${buildGradingResponseSchemaText(
        {
          minScore,
          maxScore,
          categoryFeedbackEnabled,
          teacherNotesEnabled,
          scoringMode: resolvedGradingConfig.scoringMode ?? 'weighted_categories',
          assignmentPointTotal:
            submission.document.assignment?.pointValue ?? null,
          grammarHighlightMode: displayOptions.grammarHighlight,
        }
      )}\nCategory-specific score bands:\n${promptShape.rubricText}\nRules:\n- Preserve valid category scores${categoryFeedbackEnabled ? '/comments' : ''} from the original output when possible.\n- Every score must fall inside one declared band for its category.\n- Return exactly one category for each rubric key.\n- Use only these rubric keys: ${rubricKeys.join(', ')}.\n- overallComment must start with "${studentFirstName},".\n${repairPrivateObservationRules ? `${repairPrivateObservationRules}\n` : ''}- Do not include markdown or explanation.`,
      messages: [
        {
          role: 'user',
          content: `Authored grading constraints:\n${authoredGradingConstraints}\n\n${compiledInvocation.userMessage}\n\nOriginal grading response:\n${rawResponseText}`,
        },
      ],
      maxTokens: rubricEvaluationMaxTokens,
      temperature: 0.1,
      metadata: {
        feature: 'grading',
        kind: 'rubric-schema-repair',
        ...gradingAiContextMetadata,
      },
    });

    const repairedParsedJson = parseFirstJsonValue(repairedResponseText);
    const repairedParsed = tryParseAiResponse(repairedParsedJson);
    if (repairedParsed?.overallComment) {
      return withPreservedHolisticFields(
        repairedParsed,
        repairedParsedJson,
        parsedJson
      ) as typeof repairedParsed;
    }
    if (repairedParsed?.categories) {
      const built = await buildAiResponseFromCategories(
        repairedParsed.categories,
        repairedParsed.teacherNote
      );
      return withPreservedHolisticFields(
        built,
        repairedParsedJson,
        parsedJson
      ) as typeof built;
    }

    throw new Error('Malformed grading assistant response');
  };

  let parsed: z.infer<typeof AiResponseSchema>;
  try {
    parsed = await parseAiResponse(responseText);
    const clampedCategories = applyGrammarHighlightScoreClamp({
      categories: parsed.categories.map((category) => ({
        ...category,
        grammarImpairsMeaning:
          typeof category.grammarImpairsMeaning === 'boolean'
            ? category.grammarImpairsMeaning
            : undefined,
      })),
      rubricCategories,
      minScore,
      maxScore,
      display: displayOptions,
    });
    parsed = { ...parsed, categories: clampedCategories };
  } catch (error) {
    if (isGradingRequestDeadlineError(error)) {
      return gradingDeadlineResponse();
    }
    if (isLlmFallbackRetrySignal(error)) return retryResponse();
    return dataResponse(
      {
        success: false,
        message: 'Grading Assistant returned malformed data. Please try again.',
      },
      { status: 502 }
    );
  }

  const rubricScores = parsed.categories.reduce<
    Record<string, Prisma.InputJsonValue>
  >((acc, item) => {
    acc[item.key] = {
      score: item.score,
      comment: item.comment,
      isAi: true,
    };
    return acc;
  }, {});

  const overallComment = parsed.overallComment;
  // Compute overall grading fields, honoring holistic mode when selected.
  let overallScore: number;
  let numericPercentage: number | null;
  let letterGrade: string | null;
  let score: string;
  // Blackboard/LTI needs a percent even when holistic mode stores points-only.
  let ltiPassbackPercentage: number | null = null;
  const holisticSelected =
    (resolvedGradingConfig.scoringMode ?? 'weighted_categories') ===
    'holistic_tier';
  // Track when holistic mode was configured but we had to fall back to weighted.
  let holisticFallbackReason:
    | null
    | 'missing_total'
    | 'invalid_output' = null;

  if (holisticSelected) {
    // Prefer the assignment's point total; if missing/invalid, fall back to the
    // rubric's configured total points when available.
    const totalRaw =
      submission.document.assignment?.pointValue == null
        ? null
        : Number(submission.document.assignment?.pointValue);
    const rubricTotalRaw =
      resolvedGradingConfig.rubricTotalPoints == null
        ? null
        : Number(resolvedGradingConfig.rubricTotalPoints);
    const assignmentTotalCandidate =
      totalRaw != null && Number.isFinite(totalRaw) && totalRaw > 0
        ? totalRaw
        : rubricTotalRaw != null &&
            Number.isFinite(rubricTotalRaw) &&
            rubricTotalRaw > 0
          ? rubricTotalRaw
          : null;
    if (assignmentTotalCandidate == null) {
      console.warn(
        'Holistic grading fallback: missing/invalid assignment total and rubric total points',
        {
          assignmentPointValue: submission.document.assignment?.pointValue ??
            null,
          rubricTotalPoints: resolvedGradingConfig.rubricTotalPoints ?? null,
        }
      );
      holisticFallbackReason = 'missing_total';
    }
    const assignmentTotal = assignmentTotalCandidate ?? 0;
    const round = (n: number) => Math.round(n);
    const lowerExcellent = round(0.9 * assignmentTotal);
    const lowerGood = round(0.8 * assignmentTotal);
    const lowerNeedsMore = round(0.7 * assignmentTotal);
    const bandByTier = {
      excellent: { min: lowerExcellent, max: assignmentTotal },
      good: { min: lowerGood, max: lowerExcellent - 1 },
      needs_more: { min: lowerNeedsMore, max: lowerGood - 1 },
      not_present: { min: 0, max: lowerNeedsMore - 1 },
    } as const;
    const parseHolisticTuple = (p: unknown) => {
      const t =
        (((p as any)?.overallTier as
        | 'excellent'
        | 'good'
        | 'needs_more'
        | 'not_present') ?? null);
      const r = (p as any)?.overallPoints;
      const pts =
        typeof r === 'number'
          ? r
          : typeof r === 'string'
            ? Number.parseInt(r, 10)
            : Number.NaN;
      return { tier: t, requestedPoints: pts };
    };
    const allowedTiers = new Set([
      'excellent',
      'good',
      'needs_more',
      'not_present',
    ]);

    const validateAndClamp = (p: unknown) => {
      const { tier, requestedPoints } = parseHolisticTuple(p);
      if (
        !tier ||
        !allowedTiers.has(tier as string) ||
        !Number.isFinite(requestedPoints)
      ) {
        return { ok: false as const };
      }
      const band = bandByTier[tier as keyof typeof bandByTier] ??
        bandByTier.not_present;
      const clamped =
        requestedPoints < band.min
          ? band.min
          : requestedPoints > band.max
            ? band.max
            : requestedPoints;
      if (requestedPoints !== clamped) {
        console.warn('Holistic grading points adjusted to band', {
          requestedPoints,
          adjustedPoints: clamped,
          tier,
          band,
          assignmentTotal,
        });
      }
      return { ok: true as const, clamped };
    };

    let useHolistic = assignmentTotalCandidate != null;
    let validated =
      assignmentTotalCandidate != null ? validateAndClamp(parsed) : { ok: false as const };

    // Retry once when invalid holistic fields are returned.
    if (useHolistic && !validated.ok) {
      try {
        const retryText = await getGradingLlmCompletion({
          model,
          system,
          messages: compiledInvocation.messages,
          maxTokens,
          metadata: {
            feature: 'grading',
            kind: 'rubric-evaluation',
            retry: 'holistic-retry',
            gradingConfigSource: resolvedGradingConfig.source,
            ...gradingAiContextMetadata,
            assignmentTypeGradingLabel: resolvedGradingConfig.label,
          },
        });
        parsed = await parseAiResponse(retryText);
        validated = validateAndClamp(parsed);
      } catch (error) {
        if (isGradingRequestDeadlineError(error)) {
          return gradingDeadlineResponse();
        }
        if (isLlmFallbackRetrySignal(error)) return retryResponse();
      }
    }

    if (useHolistic && validated.ok) {
      overallScore = validated.clamped;
      numericPercentage = null;
      letterGrade = null;
      score = `${overallScore}/${assignmentTotal}`;
      ltiPassbackPercentage =
        assignmentTotal > 0 ? Math.round((overallScore / assignmentTotal) * 100) : null;
    } else if (assignmentTotalCandidate == null) {
      return dataResponse(
        {
          success: false,
          message:
            'Holistic grading needs a positive assignment point total. Set point value on the assignment or rubric total points on the type.',
        },
        { status: 422 }
      );
    } else {
      holisticFallbackReason = holisticFallbackReason ?? 'invalid_output';
      const baseGradeFields = buildDynamicGradeFields({
        categories: parsed.categories,
        rubricScores,
        scoringType,
        maxScore,
        rubricCategories,
        bandScored: promptShape.bandScored,
      });
      const adjusted = applyStrictnessToGradeFields({
        ...baseGradeFields,
        scoringType,
        gradingAssistantStrictnessLevel,
      });
      const pct =
        typeof adjusted.numericPercentage === 'number' &&
        Number.isFinite(adjusted.numericPercentage)
          ? adjusted.numericPercentage
          : null;
      const pointsFromPercent =
        pct != null
          ? Math.round((pct / 100) * assignmentTotal)
          : Number.isFinite(adjusted.overallScore) && maxScore > 0
            ? Math.round((adjusted.overallScore / maxScore) * assignmentTotal)
            : Number.NaN;
      if (!Number.isFinite(pointsFromPercent)) {
        return dataResponse(
          {
            success: false,
            message:
              'Holistic grading could not interpret the model output. Try generating again.',
          },
          { status: 422 }
        );
      }
      overallScore = Math.min(
        assignmentTotal,
        Math.max(0, pointsFromPercent)
      );
      numericPercentage = null;
      letterGrade = null;
      score = `${overallScore}/${assignmentTotal}`;
      ltiPassbackPercentage =
        assignmentTotal > 0
          ? Math.round((overallScore / assignmentTotal) * 100)
          : null;
    }
  } else {
    const baseGradeFields = buildDynamicGradeFields({
      categories: parsed.categories,
      rubricScores,
      scoringType,
      maxScore,
      rubricCategories,
      bandScored: promptShape.bandScored,
    });
    const adjusted = applyStrictnessToGradeFields({
      ...baseGradeFields,
      scoringType,
      gradingAssistantStrictnessLevel,
    });
    overallScore = adjusted.overallScore;
    numericPercentage = adjusted.numericPercentage;
    letterGrade = adjusted.letterGrade;
    score = adjusted.score ?? '';
    ltiPassbackPercentage = adjusted.numericPercentage;
  }

  // Grammar/syntax highlighting has always run for every non-AP-History
  // rubric, so a rubric whose categories say nothing about it keeps running it.
  // Only a rubric that explicitly opts every category out skips the pass.
  const grammarHighlightingEnabled = shouldRunGrammarChecker(
    displayOptions,
    rubricCategories,
    resolvedGradingConfig.outputSchemaSnapshot
  );
  const grammarCategoryKeys = new Set(
    rubricCategories
      .filter((category) => isGrammarHighlightCategory(category))
      .map((category) => category.key)
  );
  const grammarAndMechanicsScore =
    parsed.categories.find((item) => grammarCategoryKeys.has(item.key))
      ?.score ?? null;

  let grammarIssues: Prisma.InputJsonValue | null = null;
  const parseGrammarIssuesFromResponseText = (responseText: string) => {
    try {
      const parsedGrammarJson = parseFirstJsonValue(responseText);
      const parsedFromJson = parseGrammarIssuesPayload(parsedGrammarJson, {
        sourceText: submission.text,
      });
      if (parsedFromJson.length > 0) return parsedFromJson;
    } catch {
      // Fall through and attempt to salvage issue objects from partial JSON.
    }

    return parseGrammarIssuesPayload(
      extractJsonObjectCandidates(responseText),
      {
        sourceText: submission.text,
      }
    );
  };

  const buildGrammarIssuesPayload = (
    issues: ReturnType<typeof parseGrammarIssuesPayload>
  ) =>
    ({
      version: 1,
      issues: issues.map((issue) => ({
        id: crypto.randomUUID(),
        excerpt: issue.excerpt,
        occurrence: issue.occurrence,
        kind: issue.kind,
        ruleNumber: issue.ruleNumber,
        rule: issue.rule,
        message: issue.message,
      })),
    }) satisfies Prisma.InputJsonValue;

  if (!grammarHighlightingEnabled) {
    // Write an empty issue set rather than leaving the field untouched, so
    // turning highlighting off and re-grading clears highlights an earlier run
    // stored. A grammar pass that merely fails still leaves them alone.
    grammarIssues = buildGrammarIssuesPayload([]);
  } else if (useE2EFixture) {
    grammarIssues = buildGrammarIssuesPayload(
      parseGrammarIssuesPayload(
        {
          issues: [
            {
              excerpt: 'Reading expands our vocabulary',
              kind: 'error',
              message: 'Use a more precise verb in this sentence.',
            },
          ],
        },
        { sourceText: submission.text }
      )
    );
  } else {
    try {
      const grammarSystem = buildGrammarCheckerSystemPrompt();

      const grammarUserPrompt = buildGrammarCheckerUserPrompt(submission.text);

      let grammarResponseText = await getGradingLlmCompletion({
        model,
        system: grammarSystem,
        messages: [{ role: 'user', content: grammarUserPrompt }],
        maxTokens: 1600,
        temperature: 0.2,
        metadata: {
          feature: 'grading',
          kind: 'grammar-issues',
          ...gradingAiContextMetadata,
        },
      });
      let parsedGrammarIssues =
        parseGrammarIssuesFromResponseText(grammarResponseText);

      if (
        parsedGrammarIssues.length === 0 &&
        grammarAndMechanicsScore !== null &&
        grammarAndMechanicsScore <= 4
      ) {
        grammarResponseText = await getGradingLlmCompletion({
          model,
          system: grammarSystem,
          messages: [
            {
              role: 'user',
              content: buildGrammarCheckerRetryUserPrompt(submission.text),
            },
          ],
          maxTokens: 1600,
          temperature: 0.2,
          metadata: {
            feature: 'grading',
            kind: 'grammar-issues',
            retry: 'schema-repair',
            ...gradingAiContextMetadata,
          },
        });
        parsedGrammarIssues =
          parseGrammarIssuesFromResponseText(grammarResponseText);
      }

      grammarIssues = buildGrammarIssuesPayload(parsedGrammarIssues);
    } catch (error) {
      if (isGradingRequestDeadlineError(error)) {
        return gradingDeadlineResponse();
      }
      if (error instanceof Response && error.status === 429) return error;
      if (isLlmFallbackRetrySignal(error)) return retryResponse();
      grammarIssues = null;
    }
  }

  // Write AI grading results directly to the Submission
  if (gradingDeadlineSignal.aborted) {
    return gradingDeadlineResponse();
  }

  const now = new Date();
  const gradeData = {
    rubricScores: rubricScores as Prisma.InputJsonValue,
    overallScore,
    overallComment,
    numericPercentage,
    letterGrade,
    score,
    ...(grammarIssues !== null ? { grammarIssues } : {}),
    aiMeta: {
      model,
      gradedAt: now.toISOString(),
      gradingConfigSource: resolvedGradingConfig.source,
      assignmentTypeRubricSource: resolvedGradingConfig.source,
      assignmentTypeGradingVersion: resolvedGradingConfig.version,
      assignmentTypeGradingLabel: resolvedGradingConfig.label,
      assignmentTypeSourceTemplateId: resolvedGradingConfig.sourceTemplateId,
      assignmentTypeSourceTemplateSlug:
        resolvedGradingConfig.sourceTemplateSlug,
      gradingAssistantStrictnessLevel,
      assignmentTypeId: submission.document.assignmentTypeId,
      assignmentId: submission.document.assignment?.id ?? null,
      assignmentTypeKind: submission.document.assignmentType?.kind ?? null,
      rubricCategoryKeys: rubricKeys,
      documentContext,
      scoringMode: resolvedGradingConfig.scoringMode ?? 'weighted_categories',
      displaySnapshot: serializeDisplaySnapshot(displayOptions),
      ...(holisticSelected
        ? {
            holistic: {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              tier: (parsed as any).overallTier ?? null,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              requestedPoints:
                typeof (parsed as any).overallPoints === 'number'
                  ? (parsed as any).overallPoints
                  : null,
              storedPoints: overallScore,
              totalPoints:
                submission.document.assignment?.pointValue ??
                resolvedGradingConfig.rubricTotalPoints ??
                null,
            },
          }
        : {}),
      ...(holisticSelected && holisticFallbackReason
        ? {
            holisticFallback: {
              reason: holisticFallbackReason,
              usedPointsFallback: true,
            },
          }
        : {}),
    } satisfies Prisma.InputJsonValue,
    ...(!submission.gradedAt
      ? { gradedAt: now, gradedByMembershipId: gradeActorMembershipId }
      : {}),
    updatedAt: now,
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: {
          id: submission.id,
          updatedAt: submission.updatedAt,
          unsubmittedAt: null,
          document: {
            is: {
              deletedAt: null,
              AND: [
                buildGradeWriteSubjectWhere({
                  actorUserId: actor.userId,
                  releasedAt: submission.releasedAt,
                }),
                teacherClassWhere,
              ],
            },
          },
        },
        data: gradeData,
      });

      const gradingAssistantRun = await tx.submissionGradingAssistantRun.create(
        {
          data: {
            submissionId: submission.id,
            assignmentTypeId: submission.document.assignmentTypeId,
            assignmentTypeGradingVersion: resolvedGradingConfig.version,
            assignmentTypeRubricSnapshot:
              resolvedGradingConfig.rubricSnapshot as Prisma.InputJsonValue,
            assignmentTypePromptConfigSnapshot:
              resolvedGradingConfig.promptConfigSnapshot as Prisma.InputJsonValue,
            source: resolvedGradingConfig.source,
            model,
            status: 'succeeded',
            metadata: {
              ...(teacherNotesEnabled ? { teacherNote: parsed.teacherNote } : {}),
              // The suggestions exactly as the assistant produced them. A teacher
              // edits the submission itself afterwards, so this is the only record
              // of what was suggested — it is what "reset to the suggestions"
              // restores, including after a reload.
              output: {
                rubricScores,
                overallScore,
                overallComment,
                numericPercentage,
                letterGrade,
                score,
                grammarIssues,
                gradingAssistantStrictnessLevel,
              },
              assignmentTypeGradingLabel: resolvedGradingConfig.label,
              assignmentTypeRubricSource: resolvedGradingConfig.source,
              assignmentTypeSourceTemplateId:
                resolvedGradingConfig.sourceTemplateId,
              assignmentTypeSourceTemplateSlug:
                resolvedGradingConfig.sourceTemplateSlug,
              gradingAssistantStrictnessLevel,
              assignmentTypeId: submission.document.assignmentTypeId,
              assignmentId: submission.document.assignment?.id ?? null,
              assignmentTypeKind:
                submission.document.assignmentType?.kind ?? null,
              scoringType,
              rubricKeys,
              rubricCategoryKeys: rubricKeys,
              gradedAt: now.toISOString(),
              documentContext,
              scoringMode: resolvedGradingConfig.scoringMode ?? 'weighted_categories',
            } satisfies Prisma.InputJsonValue,
          },
          select: { id: true },
        }
      );

      await recordSubmissionActivity(tx, {
        submissionId: submission.id,
        organizationId,
        actorMembershipId: gradeActorMembershipId,
        actorUserId: actor.userId,
        eventType: submissionActivityEventTypes.gradingAssistantUpdated,
        source: 'grade-essay-ai',
        occurredAfterRelease: submission.releasedAt != null,
        changes: buildSubmissionActivityChanges({
          before: submission,
          after: { ...submission, ...gradeData },
        }),
        metadata: {
          gradingAssistantRunId: gradingAssistantRun.id,
          model,
          gradingConfigSource: resolvedGradingConfig.source,
          gradingConfigVersion: resolvedGradingConfig.version,
        },
      });
    });
  } catch (error) {
    if (isPrismaRecordNotFoundError(error)) return staleGradeResponse();
    throw error;
  }

  // Dev-only: attempt Blackboard mock AGS passback when configured
  try {
    await maybePostGradeToBlackboard({ numericPercentage: ltiPassbackPercentage });
  } catch (error) {
    console.warn('Blackboard AGS passback (mock) failed', { error });
  }

  return dataResponse({
    success: true,
    message: 'Grading Assistant suggestions generated.',
    ...(teacherNotesEnabled ? { teacherNote: parsed.teacherNote } : {}),
    rubricScores,
    overallScore,
    overallComment,
    numericPercentage,
    letterGrade,
    score,
    grammarIssues,
    rubricConfig,
    gradingAssistantStrictnessLevel,
  });
}
