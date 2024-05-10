import { json, type ActionFunctionArgs } from '@remix-run/node'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { redirectWithToast } from '#app/utils/toast.server'

const POST = withZod(z.object({ versionId: z.string() }))

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const { error, data } = await POST.validate(formData)
	if (error) return validationError(error)

	const version = await prisma.documentVersion.findUnique({
		where: { id: data.versionId, document: { userId } },
		include: { document: true },
	})

	if (!version) {
		return redirectWithToast('/app', {
			description: 'Document version not found.',
			type: 'error',
		})
	}

	if (version.document.html && version.document.text) {
		await prisma.documentVersion.create({
			data: {
				documentId: version.documentId,
				html: version.document.html,
				text: version.document.text,
			},
		})
	}

	const doc = await prisma.document.update({
		where: { id: version.documentId },
		data: { html: version.html, text: version.text },
	})

	return json({ doc })
}
