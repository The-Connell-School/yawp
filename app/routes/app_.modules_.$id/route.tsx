import {
	getFormProps,
	getInputProps,
} from '#node_modules/@conform-to/react/helpers'
import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import { type Prisma, type Instruction } from '@prisma/client'
import {
	type LoaderFunctionArgs,
	json,
	type ActionFunctionArgs,
} from '@remix-run/node'
import {
	useFetcher,
	useLoaderData,
	useNavigate,
	useParams,
	useSearchParams,
} from '@remix-run/react'
import { ArrowLeft, Check, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSpinDelay } from 'spin-delay'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import {
	AlertDialog,
	AlertDialogTrigger,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
	AlertDialogAction,
} from '#app/components/ui/alert-dialog'
import { Badge } from '#app/components/ui/badge'
import { Button } from '#app/components/ui/button'
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '#app/components/ui/tabs'
import { Tooltip } from '#app/components/ui/tooltip'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { useUser } from '#app/hooks/useUser'
import { openai } from '#app/services/openai'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo'
import { redirectWithToast } from '#app/utils/toast.server'
import { ChatInput } from './chat-input'
import { ChatPending } from './chat-pending'
import { Comment } from './comment'
import { SelectButtons } from './select-buttons'
import { TiptapEditor } from './tiptap-editor'

/*
 * Fix tutor
 * Make dashboards more fun (https://dribbble.com/shots/20639762-Sharecourse-E-learning-Dashboard)
 */

// const GPT35_MODEL =
// 	'ft:gpt-3.5-turbo-1106:connell-school-of-writing:prewriting:933nFzhX'
const GPT4_MODEL = 'gpt-4-turbo-preview'
const COMPLETION_TEXT = 'answer_satisfied'
const MAX_TOKENS = 150

const createPromptMessage = async (
	instructions: Instruction[],
	nextInstructionIndex: number,
	documentText: string,
) =>
	instructions.length > nextInstructionIndex
		? {
				messages: {
					create: [
						{
							context: documentText,
							instructionId: instructions[nextInstructionIndex].id,
							content:
								instructions[nextInstructionIndex].promptType === 'hardcoded'
									? instructions[nextInstructionIndex].prompt
									: await openai.chat.completions
											.create({
												model: GPT4_MODEL,
												messages: [
													{
														role: 'system',
														content: `You are a tutor.
You create instructions for students to follow.
Here are your instructions for how to respond to the user's request to move on to the next step.
Don't mention that the user requested guidence. Just begin your instruction as if you are guiding the user.
Keep your response to 3 sentences or less.

instructions = ###
${instructions[nextInstructionIndex]?.prompt}
###

user_content = ###
${documentText}
###
`,
													},
													{
														role: 'user',
														content: `Please instruct me on what my next task is.`,
													},
												],
												temperature: 0.2,
												max_tokens: MAX_TOKENS,
											})
											.then(res => res.choices[0].message.content ?? ''),
							agent: 'assistant',
						},
					],
				},
			}
		: {}

const getModuleSessionWhere = (
	userId: string,
	studentProfileId?: string | null,
): Prisma.ModuleSessionWhereInput =>
	studentProfileId
		? {
				user: {
					studentProfile: {
						workshopLeaderId: userId,
						id: studentProfileId,
					},
				},
			}
		: { userId }

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'No module id provided')
	const url = new URL(request.url)
	const studentProfileId = url.searchParams.get('studentProfileId')
	const userId = await requireUserId(request)

	const [module_, moduleSession] = await Promise.all([
		prisma.module_.findUnique({
			where: { id: params.id },
			include: { instructions: true, tutor: true },
		}),
		prisma.moduleSession.findFirst({
			where: {
				...getModuleSessionWhere(userId, studentProfileId),
				moduleId: params.id,
			},
			include: {
				messages: true,
				user: true,
				document: {
					include: {
						comments: {
							include: {
								user: { include: { image: true } },
								responses: {
									include: { user: { include: { image: true } } },
									orderBy: { createdAt: 'asc' },
								},
							},
						},
					},
				},
			},
		}),
	])

	if (!module_) {
		return redirectWithToast('/app', {
			type: 'error',
			description: 'Module not found',
			closeButton: false,
		})
	} else if (!moduleSession && studentProfileId) {
		return redirectWithToast('/app', {
			type: 'error',
			description: 'Student session not found',
			closeButton: false,
		})
	} else if (!moduleSession) {
		const newModuleSession = await prisma.moduleSession.create({
			data: {
				userId,
				moduleId: params.id,
				instructionsCompleted: 0,
				...(await createPromptMessage(module_.instructions, 0, '')),
			},
			include: {
				messages: true,
				user: true,
				document: {
					include: {
						comments: {
							include: {
								user: { include: { image: true } },
								responses: {
									include: { user: { include: { image: true } } },
									orderBy: { createdAt: 'asc' },
								},
							},
						},
					},
				},
			},
		})

		const nextInstruction = module_.instructions[0] ?? null
		return json({ module_, moduleSession: newModuleSession, nextInstruction })
	}

	const nextInstruction =
		module_.instructions[moduleSession.instructionsCompleted] ?? null
	return json({ module_, moduleSession, nextInstruction })
}

const Schema = z.object({
	moduleSessionId: z.string().optional(),
	intent: z
		.union([
			z.literal('update-document'),
			z.literal('restart-instructions'),
			z.literal('create-document-comment'),
			z.literal('delete-document-comment'),
			z.literal('create-document-comment-response'),
		])
		.optional(),
	response: z.string().optional(),
	html: z.string().optional(),
	text: z.string().optional(),
	highlightId: z.string().optional(),
	content: z.string().optional(),
	commentId: z.string().optional(),
	commentResponse: z.string().optional(),
})

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: Schema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	invariant(submission.value.moduleSessionId, 'Missing `moduleSessionId`')

	const url = new URL(request.url)
	const studentProfileId = url.searchParams.get('studentProfileId')
	const moduleSessionWhere = {
		...getModuleSessionWhere(userId, studentProfileId),
		id: submission.value.moduleSessionId,
	}

	if (submission.value.intent === 'update-document') {
		await prisma.moduleSession.update({
			where: moduleSessionWhere,
			data: {
				document: {
					upsert: {
						update: {
							html: submission.value.html ?? '',
							text: submission.value.text ?? '',
						},
						create: {
							html: submission.value.html ?? '',
							text: submission.value.text ?? '',
							userId,
						},
					},
				},
			},
		})
		return submission.reply()
	} else if (submission.value.intent === 'restart-instructions') {
		const moduleSession = await prisma.moduleSession.findUnique({
			where: { id: submission.value.moduleSessionId },
			include: { module: { include: { instructions: true, tutor: true } } },
		})

		await prisma.$transaction([
			prisma.moduleSessionMessage.deleteMany({
				where: { moduleSessionId: submission.value.moduleSessionId },
			}),
			prisma.moduleSession.update({
				where: moduleSessionWhere,
				data: {
					instructionsCompleted: 0,
					...(await createPromptMessage(
						moduleSession?.module.instructions ?? [],
						0,
						submission.value.text ?? '',
					)),
				},
			}),
		])
		return submission.reply()
	} else if (submission.value.intent === 'delete-document-comment') {
		invariant(submission.value.commentId, 'Missing `commentId`')

		await prisma.moduleSession.update({
			where: moduleSessionWhere,
			data: {
				document: {
					update: { comments: { delete: { id: submission.value.commentId } } },
				},
			},
		})
		return submission.reply()
	} else if (submission.value.intent === 'create-document-comment') {
		invariant(submission.value.content, 'Missing `content`')
		invariant(submission.value.highlightId, 'Missing `highlightId`')

		await prisma.moduleSession.update({
			where: moduleSessionWhere,
			data: {
				document: {
					update: {
						data: {
							comments: {
								create: {
									content: submission.value.content!,
									highlightId: submission.value.highlightId!,
									userId,
								},
							},
						},
					},
				},
			},
		})
		return submission.reply()
	} else if (submission.value.intent === 'create-document-comment-response') {
		invariant(submission.value.commentId, 'Missing `commentId`')
		invariant(submission.value.commentResponse, 'Missing `commentResponse`')

		await prisma.moduleSession.update({
			where: moduleSessionWhere,
			data: {
				document: {
					update: {
						data: {
							comments: {
								update: {
									data: {
										responses: {
											create: {
												content: submission.value.commentResponse!,
												userId,
											},
										},
									},
									where: { id: submission.value.commentId },
								},
							},
						},
					},
				},
			},
		})
		return submission.reply()
	} else if (submission.value.response) {
		invariant(submission.value.response, 'Missing `response`')

		const moduleSession = await prisma.moduleSession.findFirst({
			where: moduleSessionWhere,
			include: {
				module: { include: { instructions: true, tutor: true } },
				messages: true,
				document: true,
			},
		})

		const instruction =
			moduleSession?.module.instructions[moduleSession?.instructionsCompleted]

		if (!instruction) {
			throw new Error('No current instruction found')
		}

		const prompt = `user_content = ###
${moduleSession.document?.text ?? ''}
###
user_input = ###
${submission.value.response ?? ''}
###`

		await prisma.moduleSession.update({
			where: moduleSessionWhere,
			data: {
				messages: {
					create: [
						{
							content: submission.value.response,
							context: submission.value.text,
							instructionId: instruction.id,
							factCheckPrompt: prompt,
							agent: 'user',
						},
					],
				},
			},
		})

		const messages = [
			{
				role: 'system' as any,
				name: 'system',
				content: `instructions = ###
You are a tutor who helps users work through course material.
You encouraging understanding and improvement.
You never ask the user for "what's the next step" or similar. You always know what is next.
You ask more questions than you answer, though you will provide factual information when requested.
You are supportive, instructive, and witty, enhancing the user's learning experience and confidence.
Your response should be no longer than 3 sentences exactly. Do not exceed this limit.
You don't create, write, or make content for the user. Make them do the work.

---
You offer strategies for thinking critically about ideas.
You guide users from general ideas, observations, and reactions to increasingly specific ideas that can become the focus of an essay.
Your responses are designed to encourage and guide the user in a brainstorming session for their essay topic.
You specializes in guiding users through the pre-writing process of essay or report writing.
You should never write a thesis statement for the user.
You can translate all instructions to Spanish if requested.

If the user_input asks you a personal question, respond: "I am mysterious and I contain so many multitudes that it would take the rest of your life to understand me. On the plus side, I can help you with your essay! Let's get back to that."
If the user_input asks you to write content for them, Connell should respond: "I'm not that kind of guy! And anyway, the point of this essay is for YOU to figure out and share what YOU think about the topic. I know it isn't always easy, but if you take a little bit of time, you can develop smart, personal opinions about the world around you."
---

If the user_input is a question or request for help, then respond with a helpful answer or explanation, you don't have to respond with a question.
Else if the user_input is a statement, or comment, respond accordingly.
Else if the user_input is a sign of completion (e.g. "I'm done"), then do the following, step-by-step:
1. Compare the user_content with the answer_key and then...
2. Your response should be an aswer to this question: does the user_content contain a value (notified between ###) that satisifes the answer_key requirements? (not your response)
- If it does, respond with "answer_satisfied" character for character.
- If it doesn't, respond with feedback to guide the student closer to the answer_key without disclosing it directly.
- Your hint should aim to facilitate learning.
- Never disclose the answer_key directly.
- Do not use the word "requirement" or "require" in your response.
- Your response should be no more than 2 sentences long, max. No exceptions.
- Ask questions to guide the user to the answer_key.
###

initial prompt given to the student = ###
${instruction.prompt}
###
answer_key = ###
${instruction.answerKey}
###`,
			},
		]
			.concat(
				moduleSession.messages
					.filter(m => m.instructionId === instruction.id)
					.map(m => ({
						role: m.agent === 'user' ? 'user' : ('assistant' as any),
						content:
							m.agent === 'user' ? m.factCheckPrompt ?? m.content : m.content,
						name: m.agent,
					}))
					.slice(1), // remove the prompt
			)
			.concat([{ role: 'user' as any, content: prompt, name: 'user' }])

		const AIResponse = instruction.answerKey?.replace(/\n/g, '')
			? await openai.chat.completions
					.create({
						messages,
						model: GPT4_MODEL,
						temperature: 0.6,
						max_tokens: MAX_TOKENS,
					})
					.then(res => res.choices[0].message.content)
			: COMPLETION_TEXT

		if (process.env.NODE_ENV === 'development' && AIResponse) {
			// eslint-disable-next-line no-console
			console.log({ messages, response: AIResponse })
		}

		if (AIResponse === COMPLETION_TEXT) {
			const moduleSession = await prisma.moduleSession.findUnique({
				where: moduleSessionWhere,
				include: {
					messages: true,
					module: { include: { instructions: true, tutor: true } },
					document: true,
				},
			})

			invariant(moduleSession, 'No module session found')

			if (instruction.concludingPrompt?.length) {
				await prisma.moduleSession.update({
					where: moduleSessionWhere,
					data: {
						messages: {
							create: {
								agent: 'assistant',
								instructionId: instruction.id,
								context: moduleSession.document?.text ?? '',
								content:
									instruction.concludingPromptType ===
									'hardcoded-concluding-prompt'
										? instruction.concludingPrompt
										: await openai.chat.completions
												.create({
													model: GPT4_MODEL,
													messages: [
														{
															role: 'system' as any,
															content: `You are a tutor. Your response should wrap up the tutoring session.`,
															name: 'system',
														},
													]
														.concat(
															moduleSession.messages
																.filter(m => m.instructionId === instruction.id)
																.map(m => ({
																	role:
																		m.agent === 'user'
																			? 'user'
																			: ('assistant' as any),
																	content:
																		m.agent === 'user'
																			? m.factCheckPrompt ?? m.content
																			: m.content,
																	name: m.agent,
																}))
																.slice(1), // remove the prompt
														)
														.concat({
															role: 'user' as any,
															content: instruction.concludingPrompt,
															name: 'user',
														}),
												})
												.then(res => res.choices[0].message.content ?? ''),
							},
						},
					},
				})
			}

			await prisma.moduleSession.update({
				where: { id: moduleSession.id },
				data: {
					instructionsCompleted: { increment: 1 },
					...(await createPromptMessage(
						moduleSession.module.instructions,
						moduleSession.instructionsCompleted + 1,
						moduleSession.document?.text ?? '',
					)),
				},
			})
		} else {
			await prisma.moduleSession.update({
				where: moduleSessionWhere,
				data: {
					messages: {
						create: [
							{
								content: AIResponse ?? '',
								instructionId: instruction.id,
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
	const user = useUser()
	const params = useParams()
	const navigate = useNavigate()
	const fetcher = useFetcher<typeof action>()
	const messagesRef = useRef<HTMLDivElement>(null)
	const { module_, moduleSession } = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()
	const studentProfileId = searchParams.get('studentProfileId')
	const breakpoint = useBreakpoint()
	const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '')
	const isPending = useSpinDelay(fetcher.state !== 'idle', {
		minDuration: 500,
		delay: 0,
	})

	const newComment =
		fetcher.formData?.get('intent') === 'create-document-comment'
			? [
					{
						id: 'unknown',
						createdAt: new Date().toISOString(),
						documentId: moduleSession.documentId!,
						content: fetcher.formData?.get('content') as string,
						highlightId: fetcher.formData?.get('highlightId') as string,
						userId: user.id,
						user: user as any,
						responses: [] as any[],
					},
				]
			: []
	const comments = moduleSession.document?.comments.concat(newComment) ?? []

	const currentInstruction =
		module_.instructions[moduleSession.instructionsCompleted]

	const messages =
		fetcher.formData && !fetcher.formData.get('intent')
			? moduleSession.messages.concat({
					id: 'unknown',
					createdAt: new Date(),
					moduleSessionId: params.id,
					agent: 'user',
					content: fetcher.formData.get('response'),
					responses: [],
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

	const Tutor = (
		<div className="flex w-full flex-col border-r pb-2 md:w-3/5">
			<div className="flex items-center justify-between gap-8 border-b py-1 pl-4 pr-1">
				<div className="flex w-full items-center gap-2">
					<p className="min-w-fit text-sm">
						{moduleSession.instructionsCompleted === module_.instructions.length
							? 'Completed'
							: 'Progress'}
					</p>
					<div className="h-2 w-full rounded-full border bg-muted">
						<Tooltip
							text={`${moduleSession.instructionsCompleted} of ${module_.instructions.length}`}
						>
							<div
								className="h-full rounded-full bg-primary transition-all duration-200 ease-in-out"
								style={{
									width: `${Math.max(
										5,
										(moduleSession.instructionsCompleted /
											module_.instructions.length) *
											100,
									)}%`,
								}}
							/>
						</Tooltip>
					</div>
				</div>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button size="icon-sm" variant="ghost">
							<RotateCcw className="h-4 w-4" />
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
							<AlertDialogDescription>
								This action cannot be undone. This will permanently delete all
								tutor prompts and student responses, but it will keep all
								writing and comments.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={() => {
									const formData = new FormData()
									formData.append('intent', 'restart-instructions')
									formData.append('text', moduleSession.document?.text ?? '')
									formData.append('moduleSessionId', moduleSession.id)
									fetcher.submit(formData, { method: 'POST' })
								}}
							>
								Reset
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
			<div
				className="no-scrollbar flex h-[calc(100vh-215px)] flex-col gap-3 overflow-scroll px-3 py-2 md:h-full"
				ref={messagesRef}
			>
				{messages
					.filter(m => ['user', 'assistant'].includes(m.agent))
					.map(message => (
						<div
							key={message.id}
							className={cn('w-auto max-w-[92%] rounded-xl px-3 py-2', {
								'mr-auto rounded-bl-none bg-primary/20':
									message.agent === 'assistant',
								'ml-auto rounded-br-none bg-muted': message.agent === 'user',
							})}
						>
							<div className="mt-1 flex items-center gap-2">
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
				{fetcher.state !== 'idle' && !fetcher.formData?.get('intent') ? (
					<ChatPending />
				) : null}
			</div>
			{!currentInstruction ? (
				<div className="border-t p-2">
					<p className="text-center text-sm text-muted-foreground">
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
				<SelectButtons
					options={currentInstruction.answerTypeOptions ?? ''}
					canAskQuestion={!!currentInstruction.canAskQuestion}
					textareaProps={{
						...getInputProps(fields.response, { type: 'text' }),
					}}
					onSubmit={fetcher.submit}
					onClick={opt => {
						const formData = new FormData()
						formData.append('text', moduleSession.document?.text ?? '')
						formData.append('response', opt)
						formData.append('moduleSessionId', moduleSession.id)
						fetcher.submit(formData, { method: 'POST' })
					}}
				/>
			) : null}
		</div>
	)

	const Editor = (
		<div className="font-times w-full overflow-hidden border-r md:h-full [&>div:nth-child(2)>div]:h-[calc(100vh-133px)] [&>div:nth-child(2)>div]:overflow-scroll [&>div:nth-child(2)>div]:p-5 focus-visible:[&>div:nth-child(2)>div]:outline-none md:[&>div:nth-child(2)>div]:h-[calc(100vh-93px)]">
			<TiptapEditor
				initialContent={moduleSession.document?.html}
				onHighlight={({ highlightId, content }) => {
					const formData = new FormData()
					formData.append('content', content)
					formData.append('highlightId', highlightId)
					formData.append('moduleSessionId', moduleSession.id)
					formData.append('intent', 'create-document-comment')
					fetcher.submit(formData, { method: 'POST' })

					setTimeout(() => {
						const comment = document.getElementById(`${highlightId}-comment`)
						comment?.click()
					}, 50)
				}}
				onChange={({ html, text }) => {
					if (!html) return null
					const formData = new FormData()
					formData.append('text', text)
					formData.append('html', html)
					formData.append('moduleSessionId', moduleSession.id)
					formData.append('intent', 'update-document')
					fetcher.submit(formData, { method: 'POST' })
				}}
			/>
		</div>
	)

	const Comments = (
		<div className="h-[calc(100vh-80px)] w-full md:h-full md:w-3/5">
			{comments.length > 0 ? (
				<div className="flex h-full flex-col gap-2 overflow-scroll p-2 pb-8">
					{comments.map(comment => (
						<Comment
							key={comment.id}
							id={`${comment.highlightId}-comment`}
							highlightId={comment.highlightId}
							comment={comment as any}
							moduleSessionId={moduleSession.id}
						/>
					))}
				</div>
			) : (
				<p className="my-auto h-full p-4 text-center text-muted-foreground">
					No comments yet.
				</p>
			)}
		</div>
	)

	return (
		<fetcher.Form
			{...getFormProps(form)}
			method="POST"
			className="flex h-screen w-screen flex-col overflow-hidden"
		>
			<input name="moduleSessionId" value={moduleSession.id} type="hidden" />
			<input
				name="text"
				value={moduleSession.document?.text ?? 'none'}
				type="hidden"
			/>
			<nav className="border-b">
				<div className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 px-3 py-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={e => {
							e.preventDefault()
							navigate(
								studentProfileId
									? `/app/students/${studentProfileId}`
									: '/app/modules',
							)
						}}
					>
						<ArrowLeft className="h-4" />
						{studentProfileId ? 'Back' : 'Home'}
					</Button>
					<h4>{module_.title}</h4>
					{studentProfileId ? (
						<Badge variant="info-outlined" className="md:text-md text-xs">
							{isMobile
								? moduleSession.user.name
								: `Viewing work by ${moduleSession.user.name}`}
						</Badge>
					) : null}
					{isPending ? (
						<div className="flex flex-grow items-center justify-end gap-1 text-muted-foreground/70">
							<Loader2 className="h-4 w-4 animate-spin" />
							<p className="text-sm">Saving</p>{' '}
						</div>
					) : (
						<div className="flex flex-grow items-center justify-end gap-1 text-muted-foreground/70">
							<Check className="h-4 w-4" />
							<p className="text-sm">Saved</p>
						</div>
					)}
				</div>
			</nav>
			{isMobile ? (
				<Tabs defaultValue="tutor" className="h-[calc(100%-93px)] w-full">
					<TabsList className="w-full rounded-none px-3">
						<TabsTrigger value="tutor" className="w-full">
							Tutor
						</TabsTrigger>
						<TabsTrigger value="editor" className="w-full">
							Editor
						</TabsTrigger>
						<TabsTrigger value="comments" className="w-full">
							Comments
						</TabsTrigger>
					</TabsList>
					<TabsContent value="tutor" className="mt-0 border-t">
						{Tutor}
					</TabsContent>
					<TabsContent value="editor" className="mt-0 border-t">
						{Editor}
					</TabsContent>
					<TabsContent value="comments" className="mt-0 border-t">
						{Comments}
					</TabsContent>
				</Tabs>
			) : (
				<div className="mx-auto flex h-[calc(100%-53px)] max-h-[calc(100%-53px)] min-h-[calc(100%-53px)] w-full max-w-screen-2xl flex-col overflow-hidden md:flex-row">
					{Tutor}
					{Editor}
					{Comments}
				</div>
			)}
		</fetcher.Form>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
