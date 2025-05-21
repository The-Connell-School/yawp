import { invariant } from '@epic-web/invariant'
import { type Prisma } from '@app/prisma'
import { data as dataResponse, type ActionFunctionArgs } from 'react-router'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { requireUserId } from '~/utils/auth.server.js'
import { prisma } from '~/utils/db.server.js'

const POST = withZod(
	z.object({
		documentId: z.string(),
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
	const { error, data } = await POST.validate(formData)
	if (error) return validationError(error)

	const updated = await prisma.documentComment.update({ where, data })

	if (!updated) {
		return new Response(null, { status: 404 })
	} else {
		return dataResponse(updated, { status: 201 })
	}
}
