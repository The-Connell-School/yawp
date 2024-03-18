import { parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import { type Upload } from '@prisma/client'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { json, redirect, useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { prisma } from '#app/utils/db.server'
import { toArray } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import Form, { Schema } from '../app.settings.tutors.new/route'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'Missing tutor id')
	await requireUserWithRole(request, ['admin'])
	const tutor = await prisma.tutor.findUnique({
		where: { id: params.id },
		include: { files: true },
	})

	if (!tutor) {
		return redirect('/app/settings/tutors')
	}

	return json({ tutor })
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing tutor id')
	const user = await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: Schema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	if (submission.payload.intent === 'delete') {
		await prisma.tutor.delete({ where: { id: params.id } })
		return redirectWithToast('/app/settings/tutors', {
			type: 'success',
			description: 'Tutor deleted successfully.',
			closeButton: false,
		})
	} else {
		const fileBlobs = toArray(submission.value.files_blob)
		const fileNames = toArray(submission.value.files_name)
		const fileContentTypes = toArray(submission.value.files_contentType)

		const files = fileBlobs?.reduce((acc, blob, i) => {
			const fileName = fileNames[i]
			const fileContentType = fileContentTypes[i]

			if (!fileName || !fileContentType || !blob) {
				return acc
			}

			acc.push({
				blob: Buffer.from(blob),
				name: fileName,
				contentType: fileContentType,
				userId: user.id,
			} as Upload)
			return acc
		}, [] as Upload[])

		await prisma.upload.deleteMany({
			where: { tutorId: params.id },
		})

		const created = await prisma.tutor.update({
			data: {
				name: submission.value.name,
				promptInstructions: submission.value.promptInstructions,
				answerInstructions: submission.value.answerInstructions,
				files: { create: files },
			},
			where: { id: params.id },
		})

		return redirectWithToast(`/app/settings/tutors/${created.id}`, {
			type: 'success',
			description: 'Tutor updated successfully',
			closeButton: false,
		})
	}
}

export default function Route() {
	const { tutor } = useLoaderData<typeof loader>()
	return <Form defaultValue={tutor as any} isEditing />
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
