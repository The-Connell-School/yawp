import { invariant } from '@epic-web/invariant'
import { type Prisma } from '@prisma/client'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'

const validator = withZod(
	z.object({
		documentId: z.string(),
		highlightId: z.string(),
		content: z.string(),
	}),
)

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'No id provided')
	const userId = await requireUserId(request)

	const where: Prisma.DocumentCommentWhereUniqueInput = {
		id: params.id,
		OR: [
			{ userId },
			{ user: { studentProfile: { workshopLeaderId: userId } } },
		],
	}

	if (request.method === 'DELETE') {
		await prisma.documentComment.delete({ where })
		return new Response(null, { status: 204 })
	}

	const formData = await request.formData()
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const updated = await prisma.documentComment.update({ where, data })

	if (!updated) {
		return new Response(null, { status: 404 })
	} else {
		return json(updated, { status: 201 })
	}
}
