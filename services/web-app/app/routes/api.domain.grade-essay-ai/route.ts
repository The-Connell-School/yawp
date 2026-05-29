import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@app/prisma';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { rubricCategories, rubricKeys } from '~/domain/grading/rubric';
import {
  gradingAssistantRubricInstructions,
  gradingAssistantScoreScaleInstructions,
} from '~/domain/grading/rubric-instructions';
import {
  computeWeightedPercentage,
  formatGrade,
  letterFromPercent,
} from '~/domain/grading/gradeMath';
import { firstNameFromFullName } from '~/domain/grading/personalize';
import { parseGrammarIssuesPayload } from '~/domain/grading/grammarIssues';
import { isDocumentSubmissionEnabledForScope } from '~/utils/feature-flags.server';
import { getDocumentSubmissionScope } from '~/utils/document-submission-scope.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  extractJsonObjectCandidates,
  parseFirstJsonValue,
} from '~/utils/llm-json.server';
import {
  buildTeacherClassWhere,
  canManageGrades,
  getGradingActor,
  isGradingOwnDocument,
} from '~/utils/grading-auth.server';
import {
  isApHistorySnapshot,
  parseApHistorySnapshot,
  type ApHistorySnapshot,
} from '~/domain/ap-history/schema';

const POST = z.object({
  documentId: z.string().optional(),
  submissionId: z.string().optional(),
});

const RubricKeySchema = z.enum(rubricKeys as [string, ...string[]]);

const AiCategorySchema = z.object({
  key: RubricKeySchema,
  score: z.number().int().min(1).max(5),
  comment: z.string().min(1),
});

const AiCategoriesSchema = z.array(AiCategorySchema).superRefine(
  (categories, ctx) => {
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
    }

    for (const key of rubricKeys) {
      if (!seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing rubric category key: ${key}`,
        });
      }
    }
  }
);

const AiResponseSchema = z.object({
  categories: AiCategoriesSchema,
  overallComment: z.string().min(1),
});

const AiOverallCommentSchema = z.object({
  overallComment: z.string().min(1),
});

const apHistoryDbqPointKeys = [
  'thesis',
  'contextualization',
  'document_use_describes',
  'document_use_supports_argument',
  'outside_evidence',
  'sourcing',
  'complexity',
] as const;

const apHistoryLeqPointKeys = [
  'thesis',
  'contextualization',
  'evidence',
  'analysis_reasoning',
  'complexity',
  'supporting_evidence',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toJsonValue(item)])
    ) as Prisma.InputJsonObject;
  }

  return null;
}

function apHistoryPointKeysForSnapshot(snapshot: ApHistorySnapshot) {
  return snapshot.essayType === 'dbq'
    ? apHistoryDbqPointKeys
    : apHistoryLeqPointKeys;
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
            const caption = source.caption ? `\nCaption: ${source.caption}` : '';
            return `Document ${source.position}: ${source.title}\nAttribution: ${source.attribution}${caption}\nBody: ${source.body}`;
          })
          .join('\n\n')
      : 'No DBQ documents apply to this LEQ.';

  return `Student first name: ${studentFirstName}

AP History assignment: APUSH ${essayType}
Course: APUSH
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

export async function action({ request }: ActionFunctionArgs) {
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

  const teacherClassWhere = buildTeacherClassWhere(actor);

  // Look up the submission — either by submissionId directly or by finding
  // the latest submission for the given documentId.
  const submissionSelect = {
    id: true,
    text: true,
    html: true,
    gradedAt: true,
    document: {
      select: {
        id: true,
        profileId: true,
        assignment: {
          select: {
            apHistorySnapshot: true,
            class: {
              select: {
                id: true,
                schoolId: true,
                teachers: { select: { id: true } },
              },
            },
          },
        },
        studentProfile: {
          select: {
            classes: {
              select: {
                id: true,
                schoolId: true,
                teachers: { select: { id: true } },
              },
            },
          },
        },
        profile: {
          select: {
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
      profileId: actor.profileId,
      isAdmin: actor.isAdmin,
    });
    return dataResponse(
      { success: false, message: 'Submitted essay not found.' },
      { status: 404 }
    );
  }

  if (
    isGradingOwnDocument(actor.profileId, submission.document.profileId)
  ) {
    return dataResponse(
      { success: false, message: 'You cannot run AI grading on your own submission.' },
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

  const isSubmissionEnabled = await isDocumentSubmissionEnabledForScope(
    getDocumentSubmissionScope(submission.document)
  );
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grading is currently disabled for this school.',
      type: 'error',
    });
  }

  const rubricText = rubricCategories
    .map(
      (item) =>
        `${item.key}: ${item.label} (${Math.round(item.weight * 100)}%) - ${item.description}`
    )
    .join('\n');

  const studentFirstName = firstNameFromFullName(
    submission.document.profile?.user?.name
  );
  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';

  const apHistorySnapshotCandidate =
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
Grade the APUSH ${apHistorySnapshot.essayType.toUpperCase()} using the supplied immutable assignment snapshot and AP point-style rubric.
Use only evidence from the essay and snapshot.
For DBQ, score these point keys: ${apHistoryDbqPointKeys.join(', ')}.
For LEQ, score these point keys: ${apHistoryLeqPointKeys.join(', ')}.
In overallComment, start with "${studentFirstName}," and continue with concise, actionable AP History feedback.`;

    const apUserPrompt = buildApHistoryPrompt({
      snapshot: apHistorySnapshot,
      essayText: submission.text,
      studentFirstName,
    });

    let apResponseText = '';
    try {
      apResponseText = await getLLMCompletion({
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
        },
      });

      const parsedJson = parseFirstJsonValue(apResponseText);
      if (!isRecord(parsedJson) || !isRecord(parsedJson.points)) {
        throw new Error('Malformed AP History grading assistant response');
      }

      const points = toJsonValue(
        parsedJson.points
      ) as Prisma.InputJsonObject;
      const earnedPoints = countApHistoryEarnedPoints(
        apHistorySnapshot,
        parsedJson.points
      );
      const totalPoints = apHistorySnapshot.rubric.totalPoints;
      const rubricScores = {
        schemaVersion: 1,
        rubricId: apHistorySnapshot.rubric.rubricId,
        totalPoints,
        earnedPoints,
        points,
      } satisfies Prisma.InputJsonObject;
      const numericPercentage = Math.round((earnedPoints / totalPoints) * 100);
      const letterGrade = letterFromPercent(numericPercentage);
      const score = formatGrade(numericPercentage, letterGrade);
      const overallScore = earnedPoints;
      const overallComment =
        typeof parsedJson.overallComment === 'string' &&
        parsedJson.overallComment.trim()
          ? parsedJson.overallComment
          : `${studentFirstName}, your AP History response has been scored with the ${apHistorySnapshot.rubric.rubricId} rubric.`;
      const grammarIssues = null;
      const now = new Date();

      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          rubricScores,
          overallScore,
          overallComment,
          numericPercentage,
          letterGrade,
          score,
          grammarIssues:
            grammarIssues as unknown as Prisma.NullableJsonNullValueInput,
          aiMeta: {
            model,
            rubricMode: 'ap_history',
            gradedAt: now.toISOString(),
          } satisfies Prisma.InputJsonValue,
          ...(!submission.gradedAt
            ? { gradedAt: now, gradedById: actor.profileId }
            : {}),
          updatedAt: now,
        },
      });

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
    } catch {
      return dataResponse(
        {
          success: false,
          message:
            'Grading Assistant returned malformed data. Please try again.',
        },
        { status: 502 }
      );
    }
  }

  const system = `You are a grading assistant. Return ONLY valid JSON with the schema:\n{\n  \"categories\": [{\"key\": string, \"score\": 1-5, \"comment\": string}],\n  \"overallComment\": string\n}\nScores must be integers 1-5.\nReturn exactly one category for each rubric key provided.\nProvide concise, actionable comments.\nUse the rubric language, proficiency bands, and category weights from the user prompt exactly.\n${gradingAssistantScoreScaleInstructions}\nIn overallComment, start with \"${studentFirstName},\" and continue with cohesive feedback in a warm but professional tone.\nAfter the name, continue naturally (for example: \"${studentFirstName}, you ...\").\nDo not use fixed lead-ins like \"Overall grade,\" or \"${studentFirstName}, this is your overall feedback.\"`;

  const userPrompt = `Student first name: ${studentFirstName}\n\nRubric category keys (use these exact keys in categories[].key):\n${rubricText}\n\nRubric Instructions:\n${gradingAssistantRubricInstructions}\n\nEssay:\n${submission.text}`;

  let responseText = '';

  try {
    responseText = await getLLMCompletion({
      model,
      system,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 900,
    });
  } catch (error) {
    throw error;
  }

  const buildAiResponseFromCategories = async (
    categories: z.infer<typeof AiCategoriesSchema>
  ) => {
    const overallCommentResponseText = await getLLMCompletion({
      model,
      system: `You write the overall feedback sentence for a grading assistant. Return ONLY valid JSON with the schema:\n{\n  "overallComment": string\n}\nRules:\n- overallComment must start with "${studentFirstName},".\n- Keep it warm, professional, and cohesive.\n- Do not include markdown or explanation.`,
      messages: [
        {
          role: 'user',
          content: `Student first name: ${studentFirstName}\n\nEssay:\n${submission.text}\n\nRubric category feedback:\n${JSON.stringify(categories)}`,
        },
      ],
      maxTokens: 300,
      temperature: 0.2,
      metadata: {
        feature: 'grading',
        kind: 'overall-comment',
      },
    });
    const parsedOverallComment = AiOverallCommentSchema.parse(
      parseFirstJsonValue(overallCommentResponseText)
    );

    return {
      categories,
      overallComment: parsedOverallComment.overallComment,
    };
  };

  const extractCategories = (
    value: unknown
  ): z.infer<typeof AiCategoriesSchema> | null => {
    const categoriesCandidate =
      Array.isArray(value)
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

    return { categories, overallComment: null };
  };

  const parseAiResponse = async (rawResponseText: string) => {
    const parsedJson = parseFirstJsonValue(rawResponseText);
    const parsed = tryParseAiResponse(parsedJson);
    if (parsed?.overallComment) return parsed;
    if (parsed?.categories) {
      return buildAiResponseFromCategories(parsed.categories);
    }

    const repairedResponseText = await getLLMCompletion({
      model,
      system: `You repair grading assistant JSON. Return ONLY valid JSON with the schema:\n{\n  "categories": [{"key": string, "score": 1-5, "comment": string}],\n  "overallComment": string\n}\nRules:\n- Preserve valid category scores/comments from the original output when possible.\n- Return exactly one category for each rubric key.\n- Use only these rubric keys: ${rubricKeys.join(', ')}.\n- overallComment must start with "${studentFirstName},".\n- Do not include markdown or explanation.`,
      messages: [
        {
          role: 'user',
          content: `Original grading response:\n${rawResponseText}`,
        },
      ],
      maxTokens: 900,
      temperature: 0.1,
      metadata: {
        feature: 'grading',
        kind: 'rubric-schema-repair',
      },
    });

    const repairedParsedJson = parseFirstJsonValue(repairedResponseText);
    const repairedParsed = tryParseAiResponse(repairedParsedJson);
    if (repairedParsed?.overallComment) return repairedParsed;
    if (repairedParsed?.categories) {
      return buildAiResponseFromCategories(repairedParsed.categories);
    }

    throw new Error('Malformed grading assistant response');
  };

  let parsed: z.infer<typeof AiResponseSchema>;
  try {
    parsed = await parseAiResponse(responseText);
  } catch {
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

  const average =
    parsed.categories.reduce((sum, item) => sum + item.score, 0) /
    parsed.categories.length;
  const overallScore = Math.round(average);
  const overallComment = parsed.overallComment;

  const numericPercentage = computeWeightedPercentage(
    rubricScores as unknown as Record<string, unknown>
  );
  const letterGrade =
    numericPercentage !== null ? letterFromPercent(numericPercentage) : null;
  const score = formatGrade(numericPercentage, letterGrade);

  const grammarAndMechanicsScore =
    parsed.categories.find((item) => item.key === 'grammar_and_mechanics')
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

  try {
    const grammarSystem = `You are the Grammar/Usage Checker.\nReturn ONLY valid JSON with the schema:\n{\n  \"issues\": [{\n    \"excerpt\": string,\n    \"occurrence\"?: number,\n    \"kind\": \"error\"|\"style\",\n    \"ruleNumber\"?: number,\n    \"rule\"?: string,\n    \"message\": string\n  }]\n}\nRules:\n- Highlight the smallest exact excerpt that demonstrates the issue (max 120 characters).\n- If the excerpt appears multiple times, set occurrence to the 1-based match index.\n- Keep message brief (1-2 sentences). State the rule plainly; do not offer to fix it for the student.\n- Focus on essentials: usage, composition, comma/semicolon rules, and omit needless words.\n\nComma rules:\n(1) In a series of three or more terms with a single conjunction, use a comma after each term except the last.\n(2) Enclose parenthetic expressions between commas.\n(3) Do not join independent clauses with a comma (comma splice); use a semicolon, conjunction, or separate sentences.\nSemicolon rule:\nUse a semicolon to join closely related independent clauses.\n\nStyle:\n(10) Omit needless words.`;

    const grammarUserPrompt = `Essay:\n${submission.text}\n\nReturn up to 15 issues.`;

    let grammarResponseText = await getLLMCompletion({
      model,
      system: grammarSystem,
      messages: [{ role: 'user', content: grammarUserPrompt }],
      maxTokens: 1600,
      temperature: 0.2,
      metadata: { feature: 'grading', kind: 'grammar-issues' },
    });
    let parsedGrammarIssues =
      parseGrammarIssuesFromResponseText(grammarResponseText);

    if (
      parsedGrammarIssues.length === 0 &&
      grammarAndMechanicsScore !== null &&
      grammarAndMechanicsScore <= 4
    ) {
      grammarResponseText = await getLLMCompletion({
        model,
        system: grammarSystem,
        messages: [
          {
            role: 'user',
            content: `Essay:\n${submission.text}\n\nReturn 8-12 issues using the exact schema. Do not include markdown.`,
          },
        ],
        maxTokens: 1600,
        temperature: 0.2,
        metadata: {
          feature: 'grading',
          kind: 'grammar-issues',
          retry: 'schema-repair',
        },
      });
      parsedGrammarIssues =
        parseGrammarIssuesFromResponseText(grammarResponseText);
    }

    grammarIssues = buildGrammarIssuesPayload(parsedGrammarIssues);
  } catch {
    grammarIssues = null;
  }

  // Write AI grading results directly to the Submission
  const now = new Date();
  await prisma.submission.update({
    where: { id: submission.id },
    data: {
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
      } satisfies Prisma.InputJsonValue,
      ...(!submission.gradedAt
        ? { gradedAt: now, gradedById: actor.profileId }
        : {}),
      updatedAt: now,
    },
  });

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
