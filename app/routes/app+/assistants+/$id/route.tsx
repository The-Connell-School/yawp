import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	redirect,
	json,
} from '@remix-run/node'
import {
	Form,
	Outlet,
	useActionData,
	useLoaderData,
	useMatches,
} from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { openai } from '#app/services/openai'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { useIsPending } from '#app/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariantResponse(params.id, 'Missing assistant id')

	const userId = await requireUserId(request)
	const [metadata, configuration] = await Promise.all([
		prisma.assistantMetadata.findFirst({
			where: { assistantId: params.id, userId },
			select: { isVerified: true },
		}),
		prisma.assistantConfiguration.findUnique({
			where: { assistantId: params.id },
		}),
	])

	if (!metadata?.isVerified) {
		return redirect(`/app/assistants/verify/${params.id}`)
	}

	try {
		const assistant = await openai.beta.assistants.retrieve(params.id)
		return json({ configuration, assistant })
	} catch {
		return redirect('/app/assistants')
	}
}

const Schema = z.object({ assistantId: z.string() })

export async function action({ request, params }: ActionFunctionArgs) {
	invariantResponse(params.id, 'Missing assistant id')

	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = parse(formData, { schema: Schema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const assistantId = params.id
	const [assistant, assistantMetadata] = await Promise.all([
		openai.beta.assistants.retrieve(assistantId),
		prisma.assistantMetadata.findFirst({
			where: { assistantId, userId },
			select: {
				_count: { select: { threads: true } },
				isVerified: true,
				id: true,
			},
		}),
	])

	if (!assistantMetadata?.isVerified) {
		return redirect(`/app/assistants/verify/${assistantId}`)
	}

	const run = await openai.beta.threads.createAndRun({
		assistant_id: assistantId,
		thread: {
			messages: [
				{
					role: 'user',
					content: `
						Get started! Begin your message by introducing me.
						Pretend I am a person you are talking to.
						Address me like you are talking first, and then I will respond.
					`,
				},
			],
		},
	})

	await prisma.thread.create({
		data: {
			assistantMetadataId: assistantMetadata.id,
			threadId: run.thread_id,
			name: `${assistant.name ?? 'Thread'} ${
				assistantMetadata._count.threads + 1
			}`,
		},
	})

	return redirect(`/app/assistants/${assistantId}/${run.thread_id}`)
}

export default function Route() {
	const { assistant, configuration } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const matches = useMatches()

	const currentRouteMatch = matches[matches.length - 1]
	const currentRouteId = currentRouteMatch.id
	const isChild = currentRouteId !== 'routes/app+/assistants+/$id/route'

	const [form, fields] = useForm({
		id: 'create-thread-form',
		lastResult: actionData,
		constraint: getFieldsetConstraint(Schema),
		defaultValue: { assistantId: assistant.id },
	})

	return isChild ? (
		<Outlet />
	) : (
		<main className="flex min-h-screen w-full flex-col items-center justify-center gap-2 px-2">
			<h1 className="text-center">{assistant.name}</h1>
			<p className="mx-auto mb-4 max-w-[420px] text-center text-muted-foreground">
				{configuration?.description ?? 'Hit the button below to get started!'}
			</p>
			<Form method="POST" {...getFormProps(form)}>
				<input {...getInputProps(fields.assistantId, { type: 'hidden' })} />
				<Button isLoading={isPending}>
					{configuration?.actionText ?? 'Get started'}
				</Button>
			</Form>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
