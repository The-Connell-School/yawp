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

	const updated = await prisma.courseModuleSession.update({
		where: { id: params.id, userId },
		data,
	})

	return json(updated, { status: 200 })
}
