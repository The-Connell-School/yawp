import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import {
  calculateWeightedGrade,
  percentageToLetterGrade,
} from '~/utils/gradeCalculation';

const POST = z.object({
  documentId: z.string(),
});

type RubricScoreResult = {
  dimensionId: string;
  dimensionName: string;
  score: number;
  feedback: string;
  weight: number;
};

export async function action({ request }: ActionFunctionArgs) {
  try {
    const userId = await requireUserId(request);
    const profile = await requireProfile(request, userId);

    // Only teachers can grade
    if (!profile.teacherProfile) {
      return dataResponse(
        { error: 'Only teachers can generate grades' },
        { status: 403 }
      );
    }

    const { error, data } = await parseFormData(request, POST);
    if (error) return validationError(error);

    // Get the document with its submitted snapshot
    const document = await prisma.document.findFirst({
      where: {
        id: data.documentId,
        submittedAt: { not: null },
        deletedAt: null,
      },
      include: {
        submittedSnapshot: true,
        profile: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!document || !document.submittedSnapshot) {
      return dataResponse(
        { error: 'Document not found or not submitted' },
        { status: 404 }
      );
    }

    // Get active rubric dimensions
    const dimensions = await prisma.rubricDimension.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
    });

    if (dimensions.length === 0) {
      return dataResponse(
        { error: 'No rubric dimensions found' },
        { status: 500 }
      );
    }

    const studentFirstName = document.profile.user.name?.split(' ')[0] || 'Student';
    const essayText = document.submittedSnapshot.text;

    // Build the AI prompt for grading
    const systemPrompt = `You are an experienced English teacher grading student essays. You will evaluate an essay using a rubric with multiple dimensions, providing a score (1-5) and brief feedback for each dimension, plus an overall comment that addresses the student by their first name.

Scoring guidelines:
5 - Exceptional: Demonstrates mastery and exceeds expectations
4 - Proficient: Demonstrates strong understanding and meets expectations
3 - Developing: Demonstrates basic understanding with room for improvement
2 - Emerging: Demonstrates limited understanding with significant gaps
1 - Beginning: Does not meet basic expectations

For each dimension, provide:
1. A score from 1-5
2. Brief, constructive feedback (2-3 sentences max)

After evaluating all dimensions, provide an overall comment that:
1. Starts by addressing the student by their first name (${studentFirstName})
2. Summarizes the essay's strengths and areas for improvement
3. Is encouraging and constructive (3-4 sentences)`;

    const dimensionDescriptions = dimensions
      .map((d) => `${d.name} (${d.weight * 100}% weight): ${d.description}`)
      .join('\n');

    const userPrompt = `Please grade the following essay using these rubric dimensions:

${dimensionDescriptions}

Student Essay:
${essayText}

Respond in the following JSON format:
{
  "scores": [
    {
      "dimensionName": "Thesis",
      "score": 4,
      "feedback": "Your feedback here..."
    },
    ...
  ],
  "overallComment": "${studentFirstName}, your overall comment here..."
}`;

    // Get AI grading
    const aiResponse = await getLLMCompletion({
      model: (process.env.AI_MODEL as any) ?? 'claude-3-5-sonnet-20240620',
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
      maxTokens: 2000,
    });

    // Parse AI response
    let parsedResponse: {
      scores: Array<{ dimensionName: string; score: number; feedback: string }>;
      overallComment: string;
    };

    try {
      // Try to extract JSON from the response (AI might wrap it in markdown)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      return dataResponse(
        { error: 'Failed to parse AI grading response' },
        { status: 500 }
      );
    }

    // Map AI scores to dimension IDs and validate
    const rubricScores: RubricScoreResult[] = [];
    for (const dimension of dimensions) {
      const aiScore = parsedResponse.scores.find(
        (s) => s.dimensionName.toLowerCase() === dimension.name.toLowerCase()
      );

      if (!aiScore) {
        console.warn(`No AI score found for dimension: ${dimension.name}`);
        continue;
      }

      // Validate score is 1-5
      const validatedScore = Math.min(5, Math.max(1, Math.round(aiScore.score)));

      rubricScores.push({
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        score: validatedScore,
        feedback: aiScore.feedback,
        weight: dimension.weight,
      });
    }

    // Calculate weighted grade
    const percentageGrade = calculateWeightedGrade(
      rubricScores.map((s) => ({ score: s.score, weight: s.weight }))
    );

    const letterGrade = percentageToLetterGrade(percentageGrade);

    // Check if grade already exists
    const existingGrade = await prisma.documentGrade.findUnique({
      where: { documentId: document.id },
    });

    let grade;
    if (existingGrade) {
      // Update existing grade
      grade = await prisma.documentGrade.update({
        where: { id: existingGrade.id },
        data: {
          percentageGrade: Math.round(percentageGrade * 100) / 100,
          letterGrade,
          overallComment: parsedResponse.overallComment,
          gradedBy: profile.id,
          gradedAt: new Date(),
          rubricScores: {
            deleteMany: {}, // Delete old scores
            create: rubricScores.map((s) => ({
              dimensionId: s.dimensionId,
              score: s.score,
              feedback: s.feedback,
            })),
          },
        },
        include: {
          rubricScores: {
            include: {
              dimension: true,
            },
          },
        },
      });
    } else {
      // Create new grade
      grade = await prisma.documentGrade.create({
        data: {
          documentId: document.id,
          percentageGrade: Math.round(percentageGrade * 100) / 100,
          letterGrade,
          overallComment: parsedResponse.overallComment,
          isReleased: false,
          gradedBy: profile.id,
          gradedAt: new Date(),
          rubricScores: {
            create: rubricScores.map((s) => ({
              dimensionId: s.dimensionId,
              score: s.score,
              feedback: s.feedback,
            })),
          },
        },
        include: {
          rubricScores: {
            include: {
              dimension: true,
            },
          },
        },
      });
    }

    return dataResponse({
      success: true,
      grade: {
        id: grade.id,
        percentageGrade: grade.percentageGrade,
        letterGrade: grade.letterGrade,
        overallComment: grade.overallComment,
        isReleased: grade.isReleased,
        rubricScores: grade.rubricScores.map((s) => ({
          id: s.id,
          dimensionName: s.dimension.name,
          dimensionWeight: s.dimension.weight,
          score: s.score,
          feedback: s.feedback,
        })),
      },
    });
  } catch (error) {
    console.error('Error generating grade:', error);
    return dataResponse(
      { error: 'An error occurred while generating the grade' },
      { status: 500 }
    );
  }
}
