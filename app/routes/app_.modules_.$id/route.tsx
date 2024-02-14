import {
	getFormProps,
	getInputProps,
} from '#node_modules/@conform-to/react/helpers'
import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import { type Instruction } from '@prisma/client'
import {
	type LoaderFunctionArgs,
	json,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Link, useFetcher, useLoaderData, useParams } from '@remix-run/react'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button, button } from '#app/components/ui/button'
import { openai } from '#app/services/openai'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo'
import { redirectWithToast } from '#app/utils/toast.server'
import { ChatInput } from './chat-input'
import { Editor } from './editor'

const GPT_MODEL = 'gpt-4-turbo-preview'
const COMPLETION_TEXT = 'instruction_satisfied'

const createPromptMessage = async (
	instructions: Instruction[],
	nextInstructionIndex: number,
) =>
	instructions.length > nextInstructionIndex
		? {
				messages: {
					create: [
						{
							content:
								instructions[nextInstructionIndex].promptType === 'hardcoded'
									? instructions[nextInstructionIndex].prompt
									: await openai.chat.completions
											.create({
												model: GPT_MODEL,
												messages: [
													{
														role: 'assistant',
														content: instructions[0].prompt,
														name: 'prompt',
													},
												],
											})
											.then(res => res.choices[0].message.content ?? ''),
							agent: 'assistant',
						},
					],
				},
			}
		: {}

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'No module ID provided')
	const userId = await requireUserId(request)
	const [module_, moduleSession] = await Promise.all([
		prisma.module_.findUnique({
			where: { id: params.id },
			include: { instructions: true },
		}),
		prisma.moduleSession.findFirst({
			where: { userId, moduleId: params.id },
			include: { messages: true },
		}),
	])

	if (!module_) {
		return redirectWithToast('/app', {
			type: 'error',
			description: 'Module not found',
			closeButton: false,
		})
	} else if (!moduleSession) {
		const newModuleSession = await prisma.moduleSession.create({
			data: {
				userId,
				moduleId: params.id,
				instructionsCompleted: 0,
				...(await createPromptMessage(module_.instructions, 0)),
			},
			include: { messages: true },
		})
		const nextInstruction = module_.instructions[0] ?? null
		return json({ module_, moduleSession: newModuleSession, nextInstruction })
	}

	const nextInstruction =
		module_.instructions[moduleSession.instructionsCompleted] ?? null
	return json({ module_, moduleSession, nextInstruction })
}

const Schema = z.object({
	moduleSessionId: z.string(),
	intent: z.literal('update-content').optional(),
	response: z.string().optional(),
	html: z.string().optional(),
	text: z.string().optional(),
})

const didResponseSatisfyInsruction = async (
	moduleSessionId: string,
	response: string,
) => {
	const moduleSession = await prisma.moduleSession.findUnique({
		where: { id: moduleSessionId },
		include: {
			module: { include: { instructions: true, tutor: true } },
			messages: true,
		},
	})

	const currentInstruction =
		moduleSession?.module.instructions[moduleSession?.instructionsCompleted]

	if (!currentInstruction) {
		throw new Error('No current instruction found')
	}

	return openai.chat.completions.create({
		messages: moduleSession.messages
			.map(m => ({
				role: m.agent as any,
				content: m.content,
				name: m.id,
			}))
			.concat({
				role: 'system',
				content: `
					Analyze the provided context against the specified answer key for accuracy.

					## Context
					studentContent: \`\`\`${moduleSession.currentContentText}\`\`\`
					studentResponse: \`\`\`${response}\`\`\`
					answerKey: \`\`\`${currentInstruction.answerKey}\`\`\`

					## Task
					Compare the studentContent with the answerKey. Use the following guidelines for your response:
					- If the studentResponse is a question or a request for help, respond with a helpful answer or explanation.
					- If the studentContent aligns with the answerKey, respond with "${COMPLETION_TEXT}" character for character, exactly.
					- If there is a discrepancy, provide concise feedback to guide the student closer to the answerKey without disclosing it directly. Your hint should be subtle yet clear, aiming to facilitate learning.
					- Limit your feedback to no more than two sentences, ensuring it is straightforward and focused.
					- Remember, your role is to assist in the learning process, not just to evaluate. Approach feedback as a supportive tutor, encouraging understanding and improvement.

					## Additional instructions
					${moduleSession.module.tutor?.instructions}
				`,
				name: 'FactChecker',
			}),
		model: GPT_MODEL,
		temperature: 0.2,
		max_tokens: 150,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserId(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: Schema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	if (submission.value.intent === 'update-content') {
		await prisma.moduleSession.update({
			where: { id: submission.value.moduleSessionId },
			data: {
				currentContentHtml: submission.value.html,
				currentContentText: submission.value.text,
			},
		})
		return submission.reply()
	} else if (submission.value.response) {
		await prisma.moduleSessionMessage.create({
			data: {
				moduleSessionId: submission.value.moduleSessionId,
				content: submission.value.response,
				agent: 'user',
			},
		})

		const AIResponse = await didResponseSatisfyInsruction(
			submission.value.moduleSessionId,
			submission.value.response,
		)

		if (AIResponse.choices[0].message.content === COMPLETION_TEXT) {
			const moduleSession = await prisma.moduleSession.findUnique({
				where: { id: submission.value.moduleSessionId },
				include: { module: { include: { instructions: true } } },
			})

			if (!moduleSession) {
				throw new Error('Module session not found')
			}

			await prisma.moduleSession.update({
				where: { id: moduleSession.id },
				data: {
					instructionsCompleted: { increment: 1 },
					...(await createPromptMessage(
						moduleSession.module.instructions,
						moduleSession.instructionsCompleted + 1,
					)),
				},
			})
		} else {
			await prisma.moduleSession.update({
				where: { id: submission.value.moduleSessionId },
				data: {
					messages: {
						create: [
							{
								content:
									AIResponse.choices[0].message.content ??
									"Your response didn't satisfy the instruction. Please try again.",
								agent: 'assistant',
							},
						],
					},
				},
			})
		}
	}

	return submission.reply()
}

export default function Route() {
	const params = useParams()
	const fetcher = useFetcher<typeof action>()
	const messagesRef = useRef<HTMLDivElement>(null)
	const { module_, moduleSession } = useLoaderData<typeof loader>()

	const currentInstruction =
		module_.instructions[moduleSession.instructionsCompleted]

	const messages =
		fetcher.formData && fetcher.formData.get('intent') !== 'update-content'
			? moduleSession.messages.concat({
					id: 'unknown',
					createdAt: new Date(),
					moduleSessionId: params.id,
					agent: 'user',
					content: fetcher.formData.get('response'),
				} as any)
			: moduleSession.messages

	const [form, fields] = useForm({
		id: 'module-session-response',
		lastResult: fetcher.data,
		constraint: getZodConstraint(Schema),
	})

	useEffect(() => {
		messagesRef.current?.scrollTo({
			top: messagesRef.current.scrollHeight,
			behavior: 'smooth',
		})
	}, [messages])

	return (
		<fetcher.Form
			{...getFormProps(form)}
			method="POST"
			className="flex h-screen w-screen flex-col overflow-hidden"
		>
			<input name="moduleSessionId" value={moduleSession.id} type="hidden" />
			<nav className="flex w-full items-center gap-4 border-b px-2 py-2">
				<Button asChild variant="secondary" size="sm">
					<Link to="/app">
						<ArrowLeft className="h-4" />
						Home
					</Link>
				</Button>
				<h4>{module_.title}</h4>
			</nav>
			<div className="flex h-[calc(100%-53px)] max-h-[calc(100%-53px)] min-h-[calc(100%-53px)] overflow-hidden">
				<div className="flex w-1/2 flex-col border-r pb-2">
					<div
						className="flex h-screen flex-col gap-3 overflow-scroll px-3 py-2 sm:h-[calc(100vh-90px)]"
						ref={messagesRef}
					>
						{messages
							.filter(m => ['user', 'assistant'].includes(m.agent))
							.map(message => (
								<div
									key={message.id}
									className={cn('w-auto max-w-[92%] rounded-xl px-3 py-2', {
										'mr-auto rounded-bl-none bg-primary/15':
											message.agent === 'assistant',
										'ml-auto rounded-br-none bg-foreground/5':
											message.agent === 'user',
									})}
								>
									<div className="flex items-center gap-2">
										<p className="text-xs font-bold">
											{message.agent === 'assistant' ? 'Tutor' : 'You'}
										</p>
										<p className="text-xs text-muted-foreground/80">
											{timeAgo(new Date(message.createdAt))}
										</p>
									</div>
									<p>{message.content}</p>
								</div>
							))}
					</div>
					{!currentInstruction ? (
						<div className="border-t p-2">
							<p className="text-center text-muted-foreground">
								You have completed all the instructions in this module.
							</p>
						</div>
					) : null}
					{currentInstruction?.answerType === 'textarea' ? (
						<div className="flex w-full items-center justify-center px-3">
							<ChatInput
								textareaProps={{
									...getInputProps(fields.response, { type: 'text' }),
								}}
								onSubmit={fetcher.submit}
							/>
						</div>
					) : currentInstruction?.answerType === 'select' ? (
						<div className="flex flex-wrap justify-center gap-2 border-t p-2">
							{currentInstruction.answerTypeOptions?.split(',').map(opt => (
								<div
									key={opt}
									className={cn(
										button({
											size: 'lg',
											className: 'cursor-pointer text-lg',
										}),
									)}
									onClick={() => {
										const formData = new FormData()
										formData.append('response', opt)
										formData.append('moduleSessionId', moduleSession.id)
										fetcher.submit(formData, { method: 'POST' })
									}}
								>
									{opt}
								</div>
							))}
						</div>
					) : null}
				</div>
				<div className="h-full w-full border-r px-8 py-2 [&>div:nth-child(2)>div]:h-full focus-visible:[&>div:nth-child(2)>div]:outline-none [&>div:nth-child(2)]:h-[calc(100%-56px)]">
					<Editor
						initialContent={moduleSession.currentContentHtml}
						onChange={({ html, text }) => {
							const formData = new FormData()
							formData.append('text', text)
							formData.append('html', html)
							formData.append('intent', 'update-content')
							formData.append('moduleSessionId', moduleSession.id)
							fetcher.submit(formData, { method: 'POST' })
						}}
					/>
				</div>
				<div className="h-full w-1/3 py-2 pl-4"></div>
			</div>
		</fetcher.Form>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
