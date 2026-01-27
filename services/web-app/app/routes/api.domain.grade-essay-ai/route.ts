import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@prisma/client';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';

const POST = z.object({
  documentId: z.string(),
});

const rubric = [
  {
    key: 'thesis_and_content',
    label: 'Thesis and Content',
    description: 'Clear argument, main idea, and relevance of content.',
  },
  {
    key: 'organization_and_structure',
    label: 'Organization and Structure',
    description: 'Introduction, body, conclusion flow, and transitions.',
  },
  {
    key: 'evidence_and_support',
    label: 'Evidence and Support',
    description: 'Use of examples, quotes, reasoning, and analysis.',
  },
  {
    key: 'voice_and_style',
    label: 'Voice and Style',
    description: 'Appropriate tone, word choice, and sentence variety.',
  },
  {
    key: 'grammar_and_mechanics',
    label: 'Grammar and Mechanics',
    description: 'Sentence structure, punctuation, and spelling.',
  },
] as const;

const AiResponseSchema = z.object({
  categories: z.array(
    z.object({
      key: z.string(),
      score: z.number().int().min(1).max(5),
      comment: z.string().min(1),
    })
  ),
  overallComment: z.string().min(1),
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
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const profile = await prisma.profile.findFirst({
    where: {
      userId,
      teacherProfile: { isNot: null },
    },
    select: {
      id: true,
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

  const system = `You are a grading assistant. Return ONLY valid JSON with the schema:\n{\n  \"categories\": [{\"key\": string, \"score\": 1-5, \"comment\": string}],\n  \"overallComment\": string\n}\nScores must be integers 1-5. Provide concise, actionable comments.`;

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

  const rubricScores = parsed.categories.reduce<Record<string, Prisma.InputJsonValue>>(
    (acc, item) => {
      acc[item.key] = {
        score: item.score,
        comment: item.comment,
        isAi: true,
      };
      return acc;
    },
    {}
  );

  const average =
    parsed.categories.reduce((sum, item) => sum + item.score, 0) /
    parsed.categories.length;
  const overallScore = Math.round(average);

  const now = new Date();
  const aiMeta = {
    model,
    promptVersion: 'v1',
    generatedAt: now.toISOString(),
  };

  const grade = await prisma.grade.upsert({
    where: { snapshotId: document.submittedSnapshotId },
    create: {
      snapshotId: document.submittedSnapshotId,
      gradedById: profile.id,
      score: `${overallScore}/5`,
      feedback: parsed.overallComment,
      rubricScores: rubricScores as Prisma.InputJsonValue,
      overallScore,
      overallComment: parsed.overallComment,
      aiMeta,
    },
    update: {
      score: `${overallScore}/5`,
      feedback: parsed.overallComment,
      rubricScores: rubricScores as Prisma.InputJsonValue,
      overallScore,
      overallComment: parsed.overallComment,
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
    overallComment: parsed.overallComment,
  });
}
