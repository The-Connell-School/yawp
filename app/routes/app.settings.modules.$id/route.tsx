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
	const module_ = await prisma.module_.findUnique({
		where: { id: params.id },
		include: { instructions: true },
	})

	if (!module_) {
		return redirect('/app/settings/modules')
	}

	return json({ module_ })
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
	} else if (submission.payload.intent === 'submit') {
		const value = submission.value as z.infer<typeof Schema>
		const prompts = toArray(value.instructions_prompt)
		const promptTypes = toArray(value.instructions_promptType)
		const answerKeys = toArray(value.instructions_answerKey)
		const answerTypes = toArray(value.instructions_answerType)

		const instructions = prompts?.reduce(
			(acc, prompt, i) => {
				const answerKey = answerKeys[i]
				const answerType = answerTypes[i] || 'textarea'
				const promptType = promptTypes[i]

				if (!prompt || !answerKey || !answerType || !promptType) {
					return acc
				}

				acc.push({ answerKey, answerType, prompt, promptType, position: i })
				return acc
			},
			[] as {
				prompt: string
				answerKey: string
				answerType: string
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
				copyContentFromPrevious:
					submission.value.copyContentFromPrevious === 'true',
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
