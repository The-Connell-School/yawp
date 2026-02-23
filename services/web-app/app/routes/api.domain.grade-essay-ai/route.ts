import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@app/prisma';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import crypto from 'node:crypto';
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
import { parseGrammarIssuesPayload } from '~/domain/grading/grammarIssues';
import { isDocumentSubmissionEnabledForSchool } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  buildTeacherClassWhere,
  canManageGrades,
  getGradingActor,
} from '~/utils/grading-auth.server';

const POST = z.object({
  documentId: z.string().optional(),
  snapshotId: z.string().optional(),
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

function tryParseJson(
  value: string
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function findMatchingJsonEnd(source: string, startIndex: number): number {
  const startChar = source[startIndex];
  if (startChar !== '{' && startChar !== '[') return -1;

  const stack: string[] = [startChar];
  let inString = false;
  let escaped = false;

  for (let i = startIndex + 1; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }
    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if (!open) return -1;
      if ((open === '{' && ch !== '}') || (open === '[' && ch !== ']')) {
        return -1;
      }
      if (stack.length === 0) return i;
    }
  }

  return -1;
}

function parseFirstJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed) {
    const direct = tryParseJson(trimmed);
    if (direct.ok) return direct.value;
  }

  const fencedBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let fencedMatch: RegExpExecArray | null;
  while ((fencedMatch = fencedBlockRegex.exec(text))) {
    const candidate = fencedMatch[1]?.trim();
    if (!candidate) continue;
    const parsed = tryParseJson(candidate);
    if (parsed.ok) return parsed.value;
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    const end = findMatchingJsonEnd(text, i);
    if (end === -1) continue;
    const candidate = text.slice(i, end + 1);
    const parsed = tryParseJson(candidate);
    if (parsed.ok) return parsed.value;
  }

  throw new Error('No parseable JSON value found in response');
}

function extractIssueObjectCandidates(text: string): unknown[] {
  const candidates: unknown[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const end = findMatchingJsonEnd(text, i);
    if (end === -1) continue;
    const parsed = tryParseJson(text.slice(i, end + 1));
    if (parsed.ok) candidates.push(parsed.value);
  }
  return candidates;
}

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);
  if (!data.documentId && !data.snapshotId) {
    return dataResponse(
      { success: false, message: 'A document or snapshot is required.' },
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

  const submittedSnapshot = data.snapshotId
    ? await prisma.documentSnapshot.findFirst({
        where: {
          id: data.snapshotId,
          submittedAt: { not: null },
          archivedAt: null,
          document: {
            deletedAt: null,
            ...teacherClassWhere,
          },
        },
        select: {
          id: true,
          text: true,
          document: {
            select: {
              id: true,
              class: { select: { schoolId: true } },
              profile: {
                select: {
                  user: { select: { name: true } },
                },
              },
            },
          },
        },
      })
    : await prisma.document
        .findFirst({
          where: {
            id: data.documentId,
            submittedAt: { not: null },
            submittedSnapshotId: { not: null },
            submittedSnapshot: {
              is: {
                submittedAt: { not: null },
                archivedAt: null,
              },
            },
            deletedAt: null,
            ...teacherClassWhere,
          },
          select: {
            submittedSnapshot: {
              select: {
                id: true,
                text: true,
              },
            },
            class: { select: { schoolId: true } },
            profile: {
              select: {
                user: { select: { name: true } },
              },
            },
            id: true,
          },
        })
        .then((doc) =>
          doc?.submittedSnapshot
            ? {
                id: doc.submittedSnapshot.id,
                text: doc.submittedSnapshot.text,
                document: {
                  id: doc.id,
                  class: doc.class,
                  profile: doc.profile,
                },
              }
            : null
        );

  if (!submittedSnapshot?.id) {
    console.warn('grade-essay-ai snapshot not found', {
      snapshotId: data.snapshotId ?? null,
      documentId: data.documentId ?? null,
      profileId: actor.profileId,
      isAdmin: actor.isAdmin,
    });
    return dataResponse(
      { success: false, message: 'Submitted essay snapshot not found.' },
      { status: 404 }
    );
  }

  if (!submittedSnapshot.text?.trim()) {
    console.warn('grade-essay-ai snapshot text missing', {
      snapshotId: submittedSnapshot.id,
      documentId: submittedSnapshot.document.id,
    });
    return dataResponse(
      { success: false, message: 'Submitted essay text not found.' },
      { status: 404 }
    );
  }

  const isSubmissionEnabled = await isDocumentSubmissionEnabledForSchool(
    submittedSnapshot.document.class?.schoolId
  );
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grading is currently disabled for this school.',
      type: 'error',
    });
  }

  const rubricText = rubric
    .map((item) => `${item.key}: ${item.label} - ${item.description}`)
    .join('\n');

  const studentFirstName = firstNameFromFullName(
    submittedSnapshot.document.profile?.user?.name
  );

  const system = `You are a grading assistant. Return ONLY valid JSON with the schema:\n{\n  \"categories\": [{\"key\": string, \"score\": 1-5, \"comment\": string}],\n  \"overallComment\": string\n}\nScores must be integers 1-5.\nReturn exactly one category for each rubric key provided.\nProvide concise, actionable comments.\nIn overallComment, start with \"${studentFirstName},\" and continue with cohesive feedback in a warm but professional tone.\nAfter the name, continue naturally (for example: \"${studentFirstName}, you ...\").\nDo not use fixed lead-ins like \"Overall grade,\" or \"${studentFirstName}, this is your overall feedback.\"`;

  const userPrompt = `Student first name: ${studentFirstName}\n\nRubric:\n${rubricText}\n\nEssay:\n${submittedSnapshot.text}`;

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

  const parsedJson = parseFirstJsonValue(responseText);
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

  const overallComment = personalizeOverallComment(
    studentFirstName,
    parsed.overallComment
  );
  const grammarAndMechanicsScore =
    parsed.categories.find((item) => item.key === 'grammar_and_mechanics')
      ?.score ?? null;

  const now = new Date();
  const aiMeta = {
    model,
    promptVersion: 'v2',
    generatedAt: now.toISOString(),
  };

  let grammarIssues: Prisma.InputJsonValue | null = null;
  const parseGrammarIssuesFromResponseText = (responseText: string) => {
    try {
      const parsedGrammarJson = parseFirstJsonValue(responseText);
      const parsedFromJson = parseGrammarIssuesPayload(parsedGrammarJson, {
        sourceText: submittedSnapshot.text,
      });
      if (parsedFromJson.length > 0) return parsedFromJson;
    } catch {
      // Fall through and attempt to salvage issue objects from partial JSON.
    }

    return parseGrammarIssuesPayload(
      extractIssueObjectCandidates(responseText),
      {
        sourceText: submittedSnapshot.text,
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

    const grammarUserPrompt = `Essay:\n${submittedSnapshot.text}\n\nReturn up to 15 issues.`;

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
            content: `Essay:\n${submittedSnapshot.text}\n\nReturn 8-12 issues using the exact schema. Do not include markdown.`,
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

  const grade = await prisma.grade.upsert({
    where: { snapshotId: submittedSnapshot.id },
    create: {
      snapshotId: submittedSnapshot.id,
      gradedById: actor.profileId,
      score,
      feedback: overallComment,
      rubricScores: rubricScores as Prisma.InputJsonValue,
      overallScore,
      overallComment,
      numericPercentage,
      letterGrade,
      ...(grammarIssues !== null ? { grammarIssues } : {}),
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
      ...(grammarIssues !== null ? { grammarIssues } : {}),
      aiMeta,
      updatedAt: now,
    },
  });

  const resolvedGrammarIssues =
    grammarIssues !== null ? grammarIssues : grade.grammarIssues;

  return dataResponse({
    success: true,
    message: 'Grading Assistant suggestions generated.',
    grade,
    rubricScores,
    overallScore,
    overallComment,
    numericPercentage,
    letterGrade,
    grammarIssues: resolvedGrammarIssues,
  });
}
