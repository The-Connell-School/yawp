import { invariant } from '@epic-web/invariant'
import { type ActionFunctionArgs } from 'react-router'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { requireUserId } from '~/utils/auth.server.js'
import { prisma } from '~/utils/db.server.js'

const PUT = withZod(
	z.object({
		text: z.string().optional(),
		html: z.string().optional(),
		title: z.string().optional(),
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

	const { error, data } = await PUT.validate(formData)
	if (error) return validationError(error)

	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		include: { roles: true },
	})

	const update = await prisma.document.update({
		where: {
			id: params.id,
			...(user.roles.some(r => r.name === 'admin')
				? {}
				: {
						OR: [
							{ userId },
							{ user: { studentProfile: { workshopLeaderId: userId } } },
						],
					}),
		},
		data,
	})

	if (!update) {
		return new Response(null, { status: 404 })
	} else {
		return new Response(null, { status: 204 })
	}
}
