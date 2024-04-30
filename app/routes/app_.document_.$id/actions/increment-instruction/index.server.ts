import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { prisma } from '#app/utils/db.server.js'
import { type ActionParams } from '../../types'
import { Schema } from './schema'

const validator = withZod(Schema)

export const handleIncrementInstruction = async ({
	userId,
	formData,
}: ActionParams) => {
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	await prisma.courseModuleSession.update({
		where: { id: data.cmsId, document: { userId } },
		data: { instructionsCompleted: { increment: 1 } },
	})
}
