
import { type ActionFunctionArgs, data as dataResponse } from 'react-router'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { requireUserId } from '~/utils/auth.server.js'
import { prisma } from '~/utils/db.server.js'

const validator = withZod(
	z.object({
		commentId: z.string(),
		content: z.string(),
	}),
)

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const creation = await prisma.documentCommentResponse.create({
		data: { ...data, userId },
	})

	return dataResponse(creation, { status: 201 })
}
