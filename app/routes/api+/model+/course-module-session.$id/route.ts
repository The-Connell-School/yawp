import { invariant } from '@epic-web/invariant'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { zfd } from 'zod-form-data'
import { requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'

const validator = withZod(
	z.object({
		instructionsCompleted: z.union([
			z.object({ increment: zfd.numeric() }),
			z.object({ decrement: zfd.numeric() }),
			zfd.numeric(),
		]),
	}),
)

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing cms id')
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const cms = await prisma.courseModuleSession.findUnique({
		where: { id: params.id },
		include: { courseModule: { include: { instructions: true } } },
	})

	if (!cms) {
		return json({ error: 'No course module session found.' }, { status: 404 })
	}

	const hasCompletedAllInstructions =
		cms.instructionsCompleted + 1 === cms.courseModule.instructions.length

	const isIncrementing =
		typeof data.instructionsCompleted === 'object' &&
		'increment' in data.instructionsCompleted

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { roles: { select: { name: true } } },
	})

	const updated = await prisma.courseModuleSession.update({
		where: {
			id: params.id,
			// TODO: once all cms are assigned to the student and not the teacher, uncomment this ode
			// ...(user?.roles.some(role => role.name === 'admin')
			// 	? {}
			// 	: {
			// 			OR: [
			// 				{ userId },
			// 				{
			// 					user: {
			// 						studentProfile: {
			// 							workshopLeaderId: userId,
			// 						},
			// 					},
			// 				},
			// 			],
			// 		}),
		},
		data: {
			...data,
			...(!hasCompletedAllInstructions && isIncrementing
				? {
						messages: {
							create: {
								content:
									cms.courseModule.instructions[cms.instructionsCompleted]
										.prompt,
								agent: 'assistant',
								instructionId:
									cms.courseModule.instructions[cms.instructionsCompleted].id,
							},
						},
					}
				: {}),
		},
	})

	return json(updated, { status: 200 })
}
