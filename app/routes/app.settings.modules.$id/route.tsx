import { parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { json, redirect, useLoaderData } from '@remix-run/react'
import { type z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import Form, {
	Schema,
	toArray,
} from '#app/routes/app.settings.modules.new/route'
import { prisma } from '#app/utils/db.server'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'Missing module id')
	await requireUserWithRole(request, ['admin'])
	const [module_, tutors] = await Promise.all([
		prisma.module_.findUnique({
			where: { id: params.id },
			include: { instructions: true },
		}),
		prisma.tutor.findMany({ select: { id: true, name: true } }),
	])

	if (!module_) {
		return redirect('/app/settings/modules')
	}

	return json({ module_, tutors })
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing student profile id')
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: Schema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	if (submission.payload.intent === 'delete') {
		await prisma.module_.delete({ where: { id: params.id } })
		return redirectWithToast('/app/settings/modules', {
			type: 'success',
			description: 'Module deleted successfully.',
			closeButton: false,
		})
	} else {
		const value = submission.value as z.infer<typeof Schema>
		const prompts = toArray(value.instructions_prompt)
		const promptTypes = toArray(value.instructions_promptType)
		const answerKeys = toArray(value.instructions_answerKey)
		const answerTypes = toArray(value.instructions_answerType)
		const answerTypesOptions = toArray(value.instructions_answerTypeOptions)

		const instructions = prompts?.reduce(
			(acc, prompt, i) => {
				const answerKey = answerKeys[i]
				const answerType = answerTypes[i] || 'textarea'
				const answerTypeOptions = answerTypesOptions[i]
				const promptType = promptTypes[i]

				if (!prompt || !answerKey || !answerType || !promptType) {
					return acc
				}

				acc.push({
					answerKey,
					answerType,
					prompt,
					promptType,
					position: i,
					answerTypeOptions,
				})
				return acc
			},
			[] as {
				prompt: string
				answerKey: string
				answerType: string
				answerTypeOptions?: string
				promptType: string
				position: number
			}[],
		)

		await prisma.instruction.deleteMany({
			where: { moduleId: params.id },
		})

		await prisma.module_.update({
			where: { id: params.id },
			data: {
				title: submission.value.title,
				position: submission.value.position,
				description: submission.value.description,
				tutorId: submission.value.tutorId,
				copyContentFromPrevious:
					submission.value.copyContentFromPrevious === 'on',
				instructions: { create: instructions },
			},
		})

		return redirectWithToast(`/app/settings/modules/${params.id}`, {
			type: 'success',
			description: 'Module updated successfully.',
			closeButton: false,
		})
	}
}

export default function Route() {
	const { module_ } = useLoaderData<typeof loader>()
	return <Form defaultValue={module_ as any} isEditing />
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
