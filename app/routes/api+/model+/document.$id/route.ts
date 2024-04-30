import { invariant } from '@epic-web/invariant'
import { type ActionFunctionArgs } from '@remix-run/node'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'

const POST = withZod(
	z.object({
		text: z.string(),
		html: z.string(),
	}),
)

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'No id provided')
	const userId = await requireUserId(request)
	const formData = await request.formData()

	if (request.method === 'DELETE') {
		const updated = await prisma.document.update({
			where: { id: params.id, userId },
			data: { deletedAt: new Date() },
		})

		if (!updated) {
			return new Response(null, { status: 404 })
		} else {
			return new Response(null, { status: 204 })
		}
	}

	const { error, data } = await POST.validate(formData)
	if (error) return validationError(error)

	const update = await prisma.document.update({
		where: {
			id: params.id,
			OR: [
				{ userId },
				{ user: { studentProfile: { workshopLeaderId: userId } } },
			],
		},
		data,
	})

	if (!update) {
		return new Response(null, { status: 404 })
	} else {
		return new Response(null, { status: 204 })
	}
}
