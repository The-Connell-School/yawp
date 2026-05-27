import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { buildGradingPrompt, buildGradingContext } from './build-grading-prompt';

const PostSchema = z.object({
  submissionId: z.string().min(1),
});

const READ_SUBMISSION_TOOL = {
  name: 'read_student_essay',
  description:
    "Returns the student's submitted essay text. Call this to read the full essay before grading.",
  input_schema: { type: 'object' as const, properties: {} },
};

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();
    const parsed = PostSchema.safeParse(body);

    if (!parsed.success) {
      return dataResponse(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { submissionId } = parsed.data;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        text: true,
        document: {
          select: {
            assignmentType: {
              select: {
                essayType: true,
                period: true,
                sourceDocuments: {
                  select: {
                    title: true,
                    attribution: true,
                    body: true,
                    position: true,
                  },
                  orderBy: { position: 'asc' },
                },
              },
            },
            assignment: {
              select: { prompt: true },
            },
          },
        },
      },
    });

    if (!submission) {
      return dataResponse(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    const essayType =
      (submission.document.assignmentType?.essayType as 'dbq' | 'leq') ?? 'dbq';

    const sources = submission.document.assignmentType?.sourceDocuments.map(
      (s, i) => ({
        label: String.fromCharCode(65 + i),
        title: s.title,
        attribution: s.attribution,
      })
    );

    const gradingPrompt = buildGradingPrompt(essayType);
    const context = buildGradingContext({
      prompt: submission.document.assignment?.prompt ?? '',
      sources,
    });

    const system = `${gradingPrompt}\n\n${context}`;

    const messages: { role: AgentType; content: string }[] = [
      {
        role: AgentType.User,
        content:
          'Grade the student essay. Call read_student_essay first, then return the rubric JSON.',
      },
    ];

    let result: string;
    try {
      result = await getLLMCompletion({
        model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
        messages,
        system,
        maxTokens: 1500,
        temperature: 0,
        tools: [READ_SUBMISSION_TOOL],
        handleToolCall: async (name) => {
          if (name === 'read_student_essay') return submission.text;
          return '';
        },
        metadata: {
          caller: 'api.grading.ap-history',
          submissionId,
          essayType,
        },
      });
    } catch (error) {
      return dataResponse(
        {
          error: 'Failed to grade essay. Please try again.',
          detail: (error as Error).message,
        },
        { status: 500 }
      );
    }

    let rubricResult: {
      rubricType: string;
      totalScore: number;
      rows: {
        key: string;
        label: string;
        earned: boolean;
        confidence: number;
        justification: string;
        suggestion: string;
      }[];
      overallComment: string;
    };

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      rubricResult = JSON.parse(jsonMatch[0]);
    } catch {
      return dataResponse(
        { error: 'Failed to parse grading result', raw: result },
        { status: 500 }
      );
    }

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        rubricScores: rubricResult as any,
        overallScore: rubricResult.totalScore,
        overallComment: rubricResult.overallComment,
        gradedAt: new Date(),
        aiMeta: {
          model: process.env.AI_MODEL ?? 'claude-sonnet-4-6',
          essayType,
          gradedBy: 'ap-history-ga',
        },
      },
    });

    return dataResponse({ rubric: rubricResult });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('AP History grading error:', error);
    return dataResponse({ error: 'An error occurred.' }, { status: 500 });
  }
}
