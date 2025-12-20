import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { CreateEssayGradeSchema } from '~/utils/schemas/essay-grade';

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request);
	const profile = await requireProfile(request, userId);

	if (!profile) {
		return dataResponse({ error: 'Profile not found.' }, { status: 404 });
	}

	const { error, data } = await parseFormData(request, CreateEssayGradeSchema);
	if (error) return validationError(error);

	// Verify user has access to this document
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
		return dataResponse({ error: 'Document not found' }, { status: 404 });
	}

	// Check permissions
	const isDocumentOwner = document.profileId === profile.id;
	const isTeacherOfStudent =
		profile.teacherProfile &&
		document.profile.studentProfile?.classes.some((cls) =>
			cls.teachers.some((teacher) => teacher.profileId === profile.id)
		);

	if (!isDocumentOwner && !isTeacherOfStudent) {
		return dataResponse(
			{ error: 'Unauthorized to grade this document' },
			{ status: 403 }
		);
	}

	// For student self-assessment, must be document owner
	if (data.graderType === 'student' && !isDocumentOwner) {
		return dataResponse(
			{ error: 'Students can only grade their own documents' },
			{ status: 403 }
		);
	}

	// For teacher grading, must be a teacher
	if (data.graderType === 'teacher' && !profile.teacherProfile) {
		return dataResponse({ error: 'Only teachers can create teacher grades' }, { status: 403 });
	}

	// Create the essay grade with all related data
	const creation = await prisma.essayGrade.create({
		data: {
			documentId: data.documentId,
			graderProfileId: profile.id,
			graderType: data.graderType,
			essayHtml: data.essayHtml,
			essayText: data.essayText,
			overallFeedback: data.overallFeedback,
			categoryScores: {
				create: data.categoryScores.map((score) => ({
					category: score.category,
					score: score.score,
					feedback: score.feedback,
				})),
			},
			highlights: {
				create: data.highlights.map((highlight) => ({
					highlightId: highlight.highlightId,
					category: highlight.category,
					content: highlight.content,
					feedback: highlight.feedback,
					position: highlight.position,
				})),
			},
		},
		include: {
			categoryScores: {
				orderBy: { category: 'asc' },
			},
			highlights: {
				orderBy: { position: 'asc' },
			},
			graderProfile: {
				include: {
					user: {
						select: {
							name: true,
						},
					},
				},
			},
		},
	});

	return dataResponse(creation, { status: 201 });
}
