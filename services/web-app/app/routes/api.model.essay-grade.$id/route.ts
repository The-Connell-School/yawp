import { invariant } from '@epic-web/invariant';
import { type Prisma } from '@app/prisma';
import { data as dataResponse, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { UpdateEssayGradeSchema } from '~/utils/schemas/essay-grade';

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'No id provided');
	const userId = await requireUserId(request);
	const profile = await requireProfile(request, userId);

	if (!profile) {
		return dataResponse({ error: 'Profile not found.' }, { status: 404 });
	}

	const grade = await prisma.essayGrade.findFirst({
		where: {
			id: params.id,
			OR: [
				// Grader can view their own grade
				{ graderProfileId: profile.id },
				// Document owner can view grades on their document
				{ document: { profileId: profile.id } },
				// Teacher can view grades on their students' documents
				{
					document: {
						profile: {
							studentProfile: {
								classes: {
									some: { teachers: { some: { profileId: profile.id } } },
								},
							},
						},
					},
				},
			],
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
			document: {
				select: {
					id: true,
					title: true,
				},
			},
		},
	});

	if (!grade) {
		return dataResponse({ error: 'Grade not found' }, { status: 404 });
	}

	return dataResponse(grade);
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'No id provided');
	const userId = await requireUserId(request);
	const profile = await requireProfile(request, userId);

	if (!profile) {
		return dataResponse({ error: 'Profile not found.' }, { status: 404 });
	}

	// Only the grader can modify their grade
	const where: Prisma.EssayGradeWhereUniqueInput = {
		id: params.id,
		graderProfileId: profile.id,
	};

	if (request.method === 'DELETE') {
		await prisma.essayGrade.delete({ where });
		return new Response(null, { status: 204 });
	}

	// PUT/PATCH - Update grade
	const { error, data } = await parseFormData(request, UpdateEssayGradeSchema);
	if (error) return validationError(error);

	// Build update data object
	const updateData: Prisma.EssayGradeUpdateInput = {
		overallFeedback: data.overallFeedback,
	};

	// If category scores provided, replace them
	if (data.categoryScores) {
		updateData.categoryScores = {
			deleteMany: {},
			create: data.categoryScores.map((score) => ({
				category: score.category,
				score: score.score,
				feedback: score.feedback,
			})),
		};
	}

	// If highlights provided, replace them
	if (data.highlights) {
		updateData.highlights = {
			deleteMany: {},
			create: data.highlights.map((highlight) => ({
				highlightId: highlight.highlightId,
				category: highlight.category,
				content: highlight.content,
				feedback: highlight.feedback,
				position: highlight.position,
			})),
		};
	}

	const updated = await prisma.essayGrade.update({
		where,
		data: updateData,
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

	if (!updated) {
		return new Response(null, { status: 404 });
	}

	return dataResponse(updated, { status: 200 });
}
