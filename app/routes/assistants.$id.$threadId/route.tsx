import { conform, useForm } from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import {
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	json,
} from '@remix-run/node'
import { useFetcher, useLoaderData, useParams } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { Skeleton } from '#app/components/ui/skeleton'
import { ChatInput } from '#app/routes/assistants.$id.$threadId/chat-input'
import { openai } from '#app/services/openai'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { LoadMoreButton, Message, PreviousMessages } from './previous-messages'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariantResponse(params.id, 'Missing assistant id')
	invariantResponse(params.threadId, 'Missing thread id')

	const userId = await requireUserId(request)

	const [assistant, openAIThread, messages, runs, internalThread] =
		await Promise.all([
			openai.beta.assistants.retrieve(params.id),
			openai.beta.threads.retrieve(params.threadId),
			openai.beta.threads.messages.list(params.threadId, {
				order: 'desc',
				limit: 50,
			}),
			openai.beta.threads.runs.list(params.threadId),
			prisma.thread.findUnique({
				where: { threadId: params.threadId, assistantMetadata: { userId } },
			}),
		])
	invariantResponse(openAIThread, 'Thread not found')
	invariantResponse(
		internalThread,
		'Something weird happened. Internal thread not found for a thread that exists in OpenAI.',
	)

	const hasMore = (messages as any).body.has_more
	const lastId = (messages as any).body.last_id
	const latestRun = runs.data[0]
	invariantResponse(latestRun, 'Something weird happened. No runs found.')

	return json({
		messages: {
			...messages,
			hasMore,
			lastId,
			data: hasMore
				? messages.data.reverse()
				: messages.data.reverse().slice(1),
		},
		latestRun,
		assistant,
	})
}

const Schema = z.object({ response: z.string(), isPoll: z.string().optional() })

export async function action({ request, params }: ActionFunctionArgs) {
	invariantResponse(params.id, 'Missing assistant id')
	invariantResponse(params.threadId, 'Missing thread id')

	await requireUserId(request)
	const formData = await request.formData()
	const submission = parse(formData, { schema: Schema })

	if (submission.value?.isPoll === 'true') {
		return json({ submission, status: 'polling' } as const)
	}

	if (submission.intent !== 'submit') {
		return json({ status: 'idle', submission } as const)
	} else if (!submission.value) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	await openai.beta.threads.messages.create(params.threadId, {
		content: submission.value.response,
		role: 'user',
	})
	await openai.beta.threads.runs.create(params.threadId, {
		assistant_id: params.id,
	})

	return json({ submission, status: 'in_progress' } as const)
}

export default function Route() {
	const { assistant, messages, latestRun } = useLoaderData<typeof loader>()
	const loaderFetcher = useFetcher<typeof loader>()
	const actionFetcher = useFetcher<typeof action>()
	const optimisticResponse = actionFetcher.formData?.get('response')
	const params = useParams()

	const [previous, setPrevious] = useState<{ lastId: string }[]>([])
	const messagesRef = useRef<HTMLDivElement>(null)

	const [actionForm, actionFields] = useForm({
		id: 'thread-response-form',
		lastSubmission: actionFetcher.data?.submission,
		constraint: getFieldsetConstraint(Schema),
	})

	// Poll for the latest run to retrive an updated data when it finishes
	useEffect(() => {
		if (latestRun.status === 'in_progress') {
			const timeout = setTimeout(() => {
				const formData = new FormData()
				formData.append('isPoll', 'true')
				formData.append('response', '<polling>')

				actionFetcher.submit(formData, { method: 'POST' })
			}, 2000)

			return () => clearTimeout(timeout)
		}
	}, [actionFetcher, latestRun.status])

	// Scroll to bottom when new messages are added
	useEffect(() => {
		messagesRef.current?.scrollTo({
			top: messagesRef.current.scrollHeight,
			behavior: 'smooth',
		})
	}, [messages])

	return (
		<main className="flex max-h-screen min-h-screen w-full flex-col pb-6">
			<div
				className="h-screen overflow-scroll pb-6 pt-16 sm:h-[calc(100vh-90px)]"
				ref={messagesRef}
			>
				{params.threadId
					? previous
							.reverse()
							.map(({ lastId }, index) => (
								<PreviousMessages
									key={lastId}
									lastId={lastId}
									assistantName={assistant.name}
									onLoadMore={value => setPrevious(p => p.concat(value))}
									hideLoadMore={index !== 0}
								/>
							))
					: null}
				{messages.hasMore && messages.lastId && !previous.length ? (
					<LoadMoreButton
						onClick={() =>
							setPrevious(p => p.concat({ lastId: messages.lastId }))
						}
					/>
				) : null}
				{messages.data.map(message => {
					const isUser = message.role === 'user'
					const text = (
						message.content.find(ct => ct.type === 'text') as
							| { text: { value: string } }
							| undefined
					)?.text.value

					if (!isUser && !text?.length) {
						return null
					}

					return (
						<Message
							key={message.id}
							isUser={isUser}
							assistantName={assistant.name}
						>
							<p>{text}</p>
						</Message>
					)
				})}
				{optimisticResponse && optimisticResponse !== '<polling>' ? (
					<Message isUser assistantName={assistant.name}>
						<p>{optimisticResponse.toString()}</p>
					</Message>
				) : null}
				<loaderFetcher.Form>
					{latestRun.status === 'in_progress' ? (
						<Message isUser={false} assistantName={assistant.name}>
							<div className="grid w-full gap-2 pt-1">
								<div className="flex w-full gap-2">
									<Skeleton className="h-4 w-1/4 rounded-sm bg-foreground/10" />
									<Skeleton className="h-4 w-1/4 rounded-sm bg-foreground/10" />
								</div>
								<Skeleton className="h-4 w-2/3 rounded-sm bg-foreground/10" />
							</div>
						</Message>
					) : latestRun.failed_at || latestRun.cancelled_at ? (
						<Message isUser={false} assistantName={assistant.name}>
							<div className="flex w-full items-center justify-between rounded-lg border border-destructive bg-destructive/15 p-2">
								<p className="pl-2">Something went wrong.</p>
								<Button type="submit" variant="destructive" size="sm">
									Try again
								</Button>
							</div>
						</Message>
					) : null}
				</loaderFetcher.Form>
			</div>
			<div className="flex w-full items-center justify-center px-3">
				<actionFetcher.Form
					method="POST"
					{...actionForm.props}
					className="w-full"
				>
					<ChatInput
						textareaProps={{ ...conform.input(actionFields.response) }}
						onSubmit={actionFetcher.submit}
					/>
				</actionFetcher.Form>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
