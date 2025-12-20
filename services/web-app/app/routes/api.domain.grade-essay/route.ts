import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { getUserId } from '~/utils/auth.server';
import {
	GenerateGradingFeedbackSchema,
	AIGradingResponseSchema,
} from '~/utils/schemas/essay-grade';
import {
	GRADING_SYSTEM_PROMPT,
	buildGradingPrompt,
	parseAIGradingResponse,
} from '~/utils/essay-grading/ai-prompts';

const LLM_FAILED = 'Failed to get grading feedback from AI. Please try again.';

const errorResponse = (message: string, status = 500) => {
	return dataResponse({ error: message }, { status });
};

export async function action({ request }: ActionFunctionArgs) {
	try {
		const userId = await getUserId(request);
		if (!userId) {
			return errorResponse('Unauthorized', 401);
		}

		const { error, data } = await parseFormData(request, GenerateGradingFeedbackSchema);
		if (error) return validationError(error);

		// Verify user has access to this document
		const profile = await prisma.profile.findFirst({
			where: { userId },
			include: {
				teacherProfile: true,
				studentProfile: true,
			},
		});

		if (!profile) {
			return errorResponse('Profile not found', 404);
		}

		const document = await prisma.document.findUnique({
			where: { id: data.documentId },
			include: {
				profile: {
					include: {
						studentProfile: {
							include: {
								classes: {
									include: {
										teachers: true,
									},
								},
							},
						},
					},
				},
			},
		});

		if (!document) {
			return errorResponse('Document not found', 404);
		}

		// Check permissions: must be teacher of student or the student themselves
		const isDocumentOwner = document.profileId === profile.id;
		const isTeacherOfStudent =
			profile.teacherProfile &&
			document.profile.studentProfile?.classes.some((cls) =>
				cls.teachers.some((teacher) => teacher.profileId === profile.id)
			);

		if (!isDocumentOwner && !isTeacherOfStudent) {
			return errorResponse('Unauthorized to grade this document', 403);
		}

		// Generate AI feedback using Claude
		const prompt = buildGradingPrompt(data.essayText, data.categories);

		let completion: string;
		try {
			completion = await getLLMCompletion({
				model: (process.env.AI_MODEL as string) ?? 'claude-3-5-sonnet-20240620',
				messages: [
					{
						role: 'user',
						content: prompt,
					},
				],
				system: GRADING_SYSTEM_PROMPT,
				maxTokens: 4000,
			});
		} catch (error) {
			console.error('AI completion error:', error);
			return errorResponse(
				LLM_FAILED + ' Error: ' + (error instanceof Error ? error.message : 'Unknown error')
			);
		}

		// Parse AI response
		let aiResponse;
		try {
			aiResponse = parseAIGradingResponse(completion);

			// Validate with Zod
			AIGradingResponseSchema.parse(aiResponse);
		} catch (error) {
			console.error('Failed to parse AI response:', error);
			console.error('Raw response:', completion);
			return errorResponse(
				'Failed to parse AI response. Please try again. Error: ' +
					(error instanceof Error ? error.message : 'Unknown error')
			);
		}

		return dataResponse({
			categoryFeedback: aiResponse.categories,
			overallFeedback: aiResponse.overallFeedback,
		});
	} catch (error) {
		console.error('Grade essay error:', error);
		return dataResponse(
			{ error: 'An unexpected error occurred.' },
			{ status: 500 }
		);
	}
}
