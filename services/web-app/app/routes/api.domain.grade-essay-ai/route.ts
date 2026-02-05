import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@prisma/client';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import crypto from 'node:crypto';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { rubricCategories, rubricKeys } from '~/domain/grading/rubric';
import {
  computeWeightedPercentage,
  formatGrade,
  letterFromPercent,
} from '~/domain/grading/gradeMath';
import {
  firstNameFromFullName,
  personalizeOverallComment,
} from '~/domain/grading/personalize';
import { isGradingAssistantEnabledForOrg } from '~/utils/featureFlags.server';
import { FEATURE_FLAGS, getFeatureFlag } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';

const POST = z.object({
  documentId: z.string(),
});

const rubric = rubricCategories;

const RubricKeySchema = z.enum(rubricKeys as [string, ...string[]]);

const AiResponseSchema = z.object({
  categories: z.array(
    z.object({
      key: RubricKeySchema,
      score: z.number().int().min(1).max(5),
      comment: z.string().min(1),
    })
  ),
  overallComment: z.string().min(1),
});

const GrammarIssuesSchema = z.object({
  issues: z
    .array(
      z.object({
        excerpt: z.string().min(1).max(120),
        occurrence: z.number().int().min(1).optional(),
        kind: z.enum(['error', 'style']),
        ruleNumber: z.number().int().optional(),
        rule: z.string().optional(),
        message: z.string().min(1).max(280),
      })
    )
    .max(25),
});

function extractJson(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in response');
  }
  return text.slice(start, end + 1);
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  // Check if document submission is enabled
  const isSubmissionEnabled = await getFeatureFlag(
    FEATURE_FLAGS.DOCUMENT_SUBMISSION
  );
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grading is currently disabled.',
      type: 'error',
    });
  }

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const profile = await prisma.profile.findFirst({
    where: {
      userId,
      teacherProfile: { isNot: null },
    },
    select: {
      id: true,
      organizationId: true,
      teacherProfile: {
        select: {
          classes: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!profile || !profile.teacherProfile) {
    return dataResponse(
      { success: false, message: 'Only teachers can grade essays.' },
      { status: 403 }
    );
  }

  if (!isGradingAssistantEnabledForOrg(profile.organizationId)) {
    return dataResponse(
      { success: false, message: 'Grading assistant is not enabled.' },
      { status: 404 }
    );
  }

  const teacherClassIds = profile.teacherProfile.classes.map((c) => c.id);

  const document = await prisma.document.findFirst({
    where: {
      id: data.documentId,
      submittedAt: { not: null },
      submittedSnapshotId: { not: null },
      classId: { in: teacherClassIds },
      deletedAt: null,
    },
    select: {
      id: true,
      submittedSnapshotId: true,
      submittedSnapshot: {
        select: {
          id: true,
          text: true,
        },
      },
      profile: {
        select: {
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!document?.submittedSnapshotId || !document.submittedSnapshot?.text) {
    return dataResponse(
      { success: false, message: 'Submitted essay text not found.' },
      { status: 404 }
    );
  }

  const rubricText = rubric
    .map((item) => `${item.key}: ${item.label} - ${item.description}`)
    .join('\n');

  const system = `You are a grading assistant. Return ONLY valid JSON with the schema:\n{\n  \"categories\": [{\"key\": string, \"score\": 1-5, \"comment\": string}],\n  \"overallComment\": string\n}\nScores must be integers 1-5.\nReturn exactly one category for each rubric key provided.\nProvide concise, actionable comments.\nAddress the student by name in a warm but professional tone in the overallComment.`;

  const userPrompt = `Rubric:\n${rubricText}\n\nEssay:\n${document.submittedSnapshot.text}`;

  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-5';
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

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJson(responseText));
  } catch (error) {
    throw error;
  }

  const parsed = AiResponseSchema.parse(parsedJson);

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

  const numericPercentage = computeWeightedPercentage(
    rubricScores as unknown as Record<string, unknown>
  );
  const letterGrade =
    numericPercentage !== null ? letterFromPercent(numericPercentage) : null;
  const score = formatGrade(numericPercentage, letterGrade);

  const studentFirstName = firstNameFromFullName(document.profile?.user?.name);
  const overallComment = personalizeOverallComment(
    studentFirstName,
    parsed.overallComment
  );

  const now = new Date();
  const aiMeta = {
    model,
    promptVersion: 'v1',
    generatedAt: now.toISOString(),
  };

  let grammarIssues: Prisma.InputJsonValue | undefined = undefined;
  try {
    const grammarSystem = `You are the Grammar/Usage Checker.\nReturn ONLY valid JSON with the schema:\n{\n  \"issues\": [{\n    \"excerpt\": string,\n    \"occurrence\"?: number,\n    \"kind\": \"error\"|\"style\",\n    \"ruleNumber\"?: number,\n    \"rule\"?: string,\n    \"message\": string\n  }]\n}\nRules:\n- Highlight the smallest exact excerpt that demonstrates the issue (max 120 characters).\n- If the excerpt appears multiple times, set occurrence to the 1-based match index.\n- Keep message brief (1-2 sentences). State the rule plainly; do not offer to fix it for the student.\n- Focus on essentials: usage, composition, comma/semicolon rules, and omit needless words.\n\nComma rules:\n(1) In a series of three or more terms with a single conjunction, use a comma after each term except the last.\n(2) Enclose parenthetic expressions between commas.\n(3) Do not join independent clauses with a comma (comma splice); use a semicolon, conjunction, or separate sentences.\nSemicolon rule:\nUse a semicolon to join closely related independent clauses.\n\nStyle:\n(10) Omit needless words.`;

    const grammarUserPrompt = `Essay:\n${document.submittedSnapshot.text}\n\nReturn up to 25 issues.`;

    const grammarResponseText = await getLLMCompletion({
      model,
      system: grammarSystem,
      messages: [{ role: 'user', content: grammarUserPrompt }],
      maxTokens: 900,
      metadata: { feature: 'grading', kind: 'grammar-issues' },
    });

    const parsedGrammar = GrammarIssuesSchema.parse(
      JSON.parse(extractJson(grammarResponseText))
    );

    grammarIssues = {
      version: 1,
      issues: parsedGrammar.issues.map((issue) => ({
        id: crypto.randomUUID(),
        ...issue,
      })),
    } satisfies Prisma.InputJsonValue;
  } catch {
    grammarIssues = undefined;
  }

  const grade = await prisma.grade.upsert({
    where: { snapshotId: document.submittedSnapshotId },
    create: {
      snapshotId: document.submittedSnapshotId,
      gradedById: profile.id,
      score,
      feedback: overallComment,
      rubricScores: rubricScores as Prisma.InputJsonValue,
      overallScore,
      overallComment,
      numericPercentage,
      letterGrade,
      grammarIssues,
      aiMeta,
    },
    update: {
      score,
      feedback: overallComment,
      rubricScores: rubricScores as Prisma.InputJsonValue,
      overallScore,
      overallComment,
      numericPercentage,
      letterGrade,
      grammarIssues,
      aiMeta,
      updatedAt: now,
    },
  });

  return dataResponse({
    success: true,
    message: 'AI suggestions generated.',
    grade,
    rubricScores,
    overallScore,
    overallComment,
    numericPercentage,
    letterGrade,
    grammarIssues,
  });
}
