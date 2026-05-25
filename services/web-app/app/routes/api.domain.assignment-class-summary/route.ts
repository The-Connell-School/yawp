import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

const GenerateSchema = z.object({
  assignmentId: z.string().min(1),
});

const SummaryJsonSchema = z.object({
  version: z.number().int(),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).min(1),
  focusAreas: z.array(z.string()).min(1).max(4),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can generate class summaries.' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return dataResponse(
      { success: false, message: 'Invalid request.' },
      { status: 400 }
    );
  }

  const { assignmentId } = parsed.data;

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      classAssignments: {
        some: { class: { teachers: { some: { id: profile.id } } } },
      },
    },
    select: {
      id: true,
      title: true,
      prompt: true,
      assignmentType: { select: { title: true } },
      classAssignments: {
        where: { class: { teachers: { some: { id: profile.id } } } },
        select: { class: { select: { grade: true, period: true } } },
        take: 1,
      },
    },
  });

  if (!assignment) {
    return dataResponse(
      { success: false, message: 'Assignment not found.' },
      { status: 404 }
    );
  }

  const allDocuments = await prisma.document.findMany({
    where: { assignmentId, deletedAt: null },
    select: { id: true },
  });

  const submissions = await prisma.submission.findMany({
    where: {
      document: { assignmentId, deletedAt: null },
      gradedAt: { not: null },
    },
    select: {
      id: true,
      rubricScores: true,
      overallScore: true,
      overallComment: true,
      numericPercentage: true,
      letterGrade: true,
      feedback: true,
    },
    orderBy: { submittedAt: 'desc' },
  });

  const totalStudents = allDocuments.length;
  const gradedCount = submissions.length;

  if (totalStudents === 0) {
    return dataResponse(
      { success: false, message: 'No submissions exist for this assignment.' },
      { status: 400 }
    );
  }

  const gradedPercent = (gradedCount / totalStudents) * 100;
  const minimumAbsoluteFloor = 3;

  if (gradedPercent < 50 || gradedCount < minimumAbsoluteFloor) {
    return dataResponse(
      {
        success: false,
        message: 'Not enough graded submissions to generate a meaningful summary.',
        gradedCount,
        totalStudents,
      },
      { status: 400 }
    );
  }

  const feedbackSummaries = submissions.map((sub, i) => {
    const rubric =
      sub.rubricScores && typeof sub.rubricScores === 'object'
        ? JSON.stringify(sub.rubricScores)
        : 'N/A';
    return `Student ${i + 1}: Overall ${sub.overallScore ?? 'N/A'}/5, ${sub.numericPercentage ?? 'N/A'}%, ${sub.letterGrade ?? 'N/A'}. Rubric: ${rubric}. Comment: ${sub.overallComment ?? sub.feedback ?? 'N/A'}`;
  });

  const system = `You are an educational data analyst. Given aggregated grading data for a class assignment, produce a structured class-wide summary. Return ONLY valid JSON with this schema:
{
  "version": 1,
  "strengths": ["string"],
  "weaknesses": ["string"],
  "focusAreas": ["string"]
}
Rules:
- strengths: 2-4 bullet points about what the class did well overall.
- weaknesses: 2-4 bullet points about where the class collectively struggled.
- focusAreas: 2-3 high-leverage skills or rubric components the teacher might focus on next.
- Frame focus areas suggestively — point out opportunities, don't prescribe lesson plans.
- Keep all points concise (1-2 sentences each).
- Do NOT name or identify individual students.
- Base analysis on the rubric scores, percentages, and feedback comments provided.`;

  const assignmentClass = assignment.classAssignments[0]?.class;
  const userPrompt = `Assignment: ${assignment.title ?? 'Untitled'}
Type: ${assignment.assignmentType.title}
Class: Grade ${assignmentClass?.grade ?? 'N/A'}, Period ${assignmentClass?.period ?? 'N/A'}
Assignment prompt: ${assignment.prompt}

${gradedCount} of ${totalStudents} students graded (${Math.round(gradedPercent)}%).

Individual grading data:
${feedbackSummaries.join('\n')}`;

  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';

  let responseText: string;
  try {
    responseText = await getLLMCompletion({
      model,
      system,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 1200,
      temperature: 0.3,
      metadata: {
        feature: 'assignment-level-feedback',
        assignmentId,
      },
    });
  } catch {
    return dataResponse(
      { success: false, message: 'Failed to generate class summary. Please try again.' },
      { status: 502 }
    );
  }

  let summaryData: z.infer<typeof SummaryJsonSchema>;
  try {
    const parsedJson = parseFirstJsonValue(responseText);
    summaryData = SummaryJsonSchema.parse(parsedJson);
  } catch {
    return dataResponse(
      { success: false, message: 'AI returned malformed summary. Please try again.' },
      { status: 502 }
    );
  }

  const currentMilestone =
    gradedPercent >= 90 ? 90 : gradedPercent >= 75 ? 75 : 50;

  const now = new Date();
  const summary = await prisma.assignmentClassSummary.upsert({
    where: { assignmentId },
    create: {
      assignmentId,
      generatedAt: now,
      gradedAtGeneration: gradedCount,
      totalAtGeneration: totalStudents,
      summaryJson: summaryData,
      lastMilestone: currentMilestone,
    },
    update: {
      generatedAt: now,
      gradedAtGeneration: gradedCount,
      totalAtGeneration: totalStudents,
      summaryJson: summaryData,
      lastMilestone: currentMilestone,
      updatedAt: now,
    },
  });

  return dataResponse({
    success: true,
    summary: {
      id: summary.id,
      generatedAt: summary.generatedAt,
      gradedAtGeneration: summary.gradedAtGeneration,
      totalAtGeneration: summary.totalAtGeneration,
      summaryJson: summaryData,
      lastMilestone: summary.lastMilestone,
    },
    gradedCount,
    totalStudents,
  });
}
