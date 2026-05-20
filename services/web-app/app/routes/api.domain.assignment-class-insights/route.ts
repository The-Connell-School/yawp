import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@app/prisma';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import {
  rubricCategories,
  rubricKeys,
  type RubricKey,
} from '~/domain/grading/rubric';
import { isClassInsightsEnabledForOrganization } from '~/utils/feature-flags.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

const POST = z.object({
  assignmentId: z.string().min(1),
});

const RubricKeySchema = z.enum(rubricKeys as [string, ...string[]]);

const AiResponseSchema = z.object({
  strengths: z.array(z.string().min(1)).min(1).max(5),
  weaknesses: z
    .array(
      z.object({
        rubricCategory: RubricKeySchema,
        observation: z.string().min(1),
        affectedCount: z.number().int().min(0),
      })
    )
    .max(rubricKeys.length),
  nextSteps: z
    .array(
      z.object({
        step: z.string().min(1),
        moduleId: z.string().nullable().optional(),
      })
    )
    .max(8),
});

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can generate class insights.' },
      { status: 403 }
    );
  }

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: data.assignmentId,
      ...(actor.isAdmin
        ? {}
        : {
            class: {
              teachers: { some: { profileId: actor.profileId } },
            },
          }),
    },
    select: {
      id: true,
      title: true,
      prompt: true,
      class: {
        select: {
          id: true,
          school: { select: { organizationId: true } },
        },
      },
    },
  });

  if (!assignment) {
    return dataResponse(
      { success: false, message: 'Assignment not found.' },
      { status: 404 }
    );
  }

  const isEnabled = await isClassInsightsEnabledForOrganization(
    assignment.class.school?.organizationId
  );
  if (!isEnabled) {
    return dataResponse(
      { success: false, message: 'Class insights are not enabled.' },
      { status: 403 }
    );
  }

  const submissions = await prisma.submission.findMany({
    where: {
      document: { assignmentId: assignment.id, deletedAt: null },
      gradedAt: { not: null },
    },
    select: {
      id: true,
      letterGrade: true,
      overallComment: true,
      rubricScores: true,
    },
  });

  if (submissions.length === 0) {
    return dataResponse(
      {
        success: false,
        message: 'No graded submissions yet — grade some essays first.',
      },
      { status: 400 }
    );
  }

  const modules = actor.isAdmin
    ? await prisma.teacherTrainingModule.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          description: true,
          teacherTrainingId: true,
        },
        orderBy: { position: 'asc' },
      })
    : await prisma.teacherTrainingModule.findMany({
        where: {
          deletedAt: null,
          teacherTraining: {
            assignedTeachers: { some: { profileId: actor.profileId } },
          },
        },
        select: {
          id: true,
          title: true,
          description: true,
          teacherTrainingId: true,
        },
        orderBy: { position: 'asc' },
      });

  const moduleById = new Map(modules.map((m) => [m.id, m]));

  const rubricSummary = rubricCategories
    .map(
      (c) =>
        `- ${c.key} (${c.label}, ${Math.round(c.weight * 100)}%): ${c.description}`
    )
    .join('\n');

  const submissionSummary = submissions
    .map((s, idx) => {
      const rubric = (s.rubricScores ?? {}) as Record<
        string,
        { score?: number; comment?: string } | undefined
      >;
      const lines = rubricKeys.map((key) => {
        const entry = rubric[key];
        return `    ${key}: ${entry?.score ?? '—'}/5 — ${entry?.comment ?? ''}`;
      });
      return [
        `Submission ${idx + 1} (letter: ${s.letterGrade ?? '—'}):`,
        ...lines,
        s.overallComment ? `    overall: ${s.overallComment}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const moduleList = modules.length
    ? modules
        .map(
          (m) =>
            `- id=${m.id} title="${m.title}"${m.description ? ` — ${m.description}` : ''}`
        )
        .join('\n')
    : '(no modules available)';

  const system = `You are a writing teacher's assistant. Analyze the graded student essays for a class and produce a concise, actionable class-level feedback report.
Return ONLY valid JSON with this exact schema:
{
  "strengths": string[],
  "weaknesses": [{"rubricCategory": string, "observation": string, "affectedCount": number}],
  "nextSteps": [{"step": string, "moduleId": string | null}]
}
Rules:
- "rubricCategory" MUST be one of: ${rubricKeys.join(', ')}.
- "affectedCount" is the number of submissions exhibiting the weakness; never exceed the total submission count.
- "moduleId" must be one of the provided training module IDs, or null if none clearly applies. Never invent IDs.
- Aim for 2-3 strengths, 2-4 weaknesses, 2-4 next steps.
- Be specific. Reference concrete patterns from the rubric comments, not generic teaching advice.
- No markdown. JSON only.`;

  const userPrompt = `Assignment: ${assignment.title ?? '(untitled)'}\nPrompt: ${assignment.prompt}\n\nRubric categories:\n${rubricSummary}\n\nAvailable teacher training modules:\n${moduleList}\n\nGraded submissions (${submissions.length}):\n${submissionSummary}`;

  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';

  const responseText = await getLLMCompletion({
    model,
    system,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 1200,
    temperature: 0.3,
    metadata: { feature: 'class-insights', assignmentId: assignment.id },
  });

  const parsedJson = parseFirstJsonValue(responseText);
  const parsed = AiResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.warn('class-insights malformed response', {
      assignmentId: assignment.id,
      issues: parsed.error.issues.slice(0, 3),
    });
    return dataResponse(
      {
        success: false,
        message: 'AI returned malformed insights. Please try again.',
      },
      { status: 502 }
    );
  }

  const rubricLabelByKey = new Map<RubricKey, string>(
    rubricCategories.map((c) => [c.key, c.label])
  );

  const weaknesses = parsed.data.weaknesses.map((w) => {
    const key = w.rubricCategory as RubricKey;
    return {
      rubricCategory: key,
      label: rubricLabelByKey.get(key) ?? key,
      observation: w.observation,
      affectedCount: Math.min(w.affectedCount, submissions.length),
    };
  });

  const nextSteps = parsed.data.nextSteps.map((step) => {
    const moduleMatch = step.moduleId
      ? (moduleById.get(step.moduleId) ?? null)
      : null;
    return {
      step: step.step,
      moduleId: moduleMatch?.id ?? null,
      moduleTitle: moduleMatch?.title ?? null,
      teacherTrainingId: moduleMatch?.teacherTrainingId ?? null,
    };
  });

  const insights = {
    strengths: parsed.data.strengths,
    weaknesses,
    nextSteps,
    submissionCount: submissions.length,
  };

  const now = new Date();
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: {
      classInsights: insights as unknown as Prisma.InputJsonValue,
      classInsightsGeneratedAt: now,
      updatedAt: now,
    },
  });

  return dataResponse({
    success: true,
    classInsights: insights,
    classInsightsGeneratedAt: now.toISOString(),
  });
}
