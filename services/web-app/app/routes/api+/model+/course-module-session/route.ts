
import { data as dataResponse, type ActionFunctionArgs } from 'react-router'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { requireUserId } from '~/utils/auth.server.js'
import { prisma } from '~/utils/db.server.js'

const POST = withZod(
	z.object({
		courseModuleId: z.string(),
		documentId: z.string(),
	}),
)

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const { error, data } = await POST.validate(formData)
	if (error) return validationError(error)

	const [document, courseModule] = await Promise.all([
		prisma.document.findUnique({ where: { id: data.documentId } }),
		prisma.courseModule.findUnique({
			where: { id: data.courseModuleId },
			include: { instructions: true },
		}),
	])

	if (!courseModule) {
		return dataResponse({ error: 'No course module found.' }, { status: 404 })
	} else if (!document) {
		return dataResponse({ error: 'No document found.' }, { status: 404 })
	}

	const firstInstruction = courseModule.instructions[0]
	const created = await prisma.courseModuleSession.create({
		data: {
			...data,
			instructionsCompleted: 0,
			userId: document.userId,
			...(firstInstruction && {
				messages: {
					create: [
						{
							content: firstInstruction.prompt,
							agent: 'assistant',
							instructionId: firstInstruction.id,
						},
					],
				},
			}),
		},
	})

	return dataResponse({ created })
}
