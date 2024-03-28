import {
	getFormProps,
	getInputProps,
} from '#node_modules/@conform-to/react/helpers'
import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import { type Prisma, type CourseModuleInstruction } from '@prisma/client'
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
import { ArrowRightIcon } from '#app/components/icons'
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
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { getLLMCompletion } from '#app/utils/getLLMCompletion'
import { cn, parseAIResponse } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo'
import { redirectWithToast } from '#app/utils/toast.server'
import { ChatInput } from './chat-input'
import { ChatPending } from './chat-pending'
import { Comment } from './comment'
import { SelectButtons } from './select-buttons'
import { TiptapEditor } from './tiptap-editor'

const COMPLETION_TEXT = 'answer_satisfied'

const createPromptMessage = async (
	instructions: CourseModuleInstruction[],
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
									: await getLLMCompletion({
											model: 'claude-3-opus-20240229',
											system: `You are a tutor.
You create instructions for students to follow.
Here are your instructions for how to respond to the user's request to move on to the next step.
Don't mention that the user requested guidence. Just begin your instruction as if you are guiding the user.

instructions = ###
${instructions[nextInstructionIndex]?.prompt}
###

user_content = ###
${documentText}
###
`,
											maxTokens: 800,
											messages: [
												{
													role: 'user',
													content: `Please instruct me on what my next task is.`,
												},
											],
										}),
							agent: 'assistant',
						},
					],
				},
			}
		: {}

const getModuleSessionWhere = (
	userId: string,
	studentProfileId?: string | null,
): Prisma.CourseModuleSessionWhereInput =>
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

	const [courseModule, courseModuleSession] = await Promise.all([
		prisma.courseModule.findUnique({
			where: { id: params.id },
			include: { instructions: true, tutor: true },
		}),
		prisma.courseModuleSession.findFirst({
			where: {
				...getModuleSessionWhere(userId, studentProfileId),
				courseModuleId: params.id,
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

	if (!courseModule) {
		return redirectWithToast('/app', {
			type: 'error',
			description: 'Module not found',
			closeButton: false,
		})
	} else if (!courseModuleSession && studentProfileId) {
		return redirectWithToast('/app', {
			type: 'error',
			description: 'Student session not found',
			closeButton: false,
		})
	} else if (!courseModuleSession) {
		const newModuleSession = await prisma.courseModuleSession.create({
			data: {
				userId,
				courseModuleId: params.id,
				instructionsCompleted: 0,
				...(await createPromptMessage(courseModule.instructions, 0, '')),
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

		const nextInstruction = courseModule.instructions[0] ?? null
		return json({
			courseModule,
			courseModuleSession: newModuleSession,
			nextInstruction,
		})
	}

	const nextInstruction =
		courseModule.instructions[courseModuleSession.instructionsCompleted] ?? null
	return json({ courseModule, courseModuleSession, nextInstruction })
}

const Schema = z.object({
	courseModuleSessionId: z.string().optional(),
	intent: z
		.union([
			z.literal('update-document'),
			z.literal('restart-instructions'),
			z.literal('create-document-comment'),
			z.literal('delete-document-comment'),
			z.literal('complete-current-instruction'),
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

	invariant(
		submission.value.courseModuleSessionId,
		'Missing `courseModuleSessionId`',
	)

	const url = new URL(request.url)
	const studentProfileId = url.searchParams.get('studentProfileId')
	const courseModuleSessionWhere = {
		...getModuleSessionWhere(userId, studentProfileId),
		id: submission.value.courseModuleSessionId,
	}

	if (submission.value.intent === 'update-document') {
		await prisma.courseModuleSession.update({
			where: courseModuleSessionWhere,
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
	} else if (submission.value.intent === 'complete-current-instruction') {
		const courseModuleSession = await prisma.courseModuleSession.findUnique({
			where: courseModuleSessionWhere,
			include: {
				document: true,
				courseModule: { include: { instructions: true, tutor: true } },
			},
		})

		if (!courseModuleSession) {
			throw new Error('No module session found')
		}

		await prisma.courseModuleSession.update({
			where: courseModuleSessionWhere,
			data: {
				instructionsCompleted: { increment: 1 },
				...(await createPromptMessage(
					courseModuleSession.courseModule.instructions,
					courseModuleSession.instructionsCompleted + 1,
					courseModuleSession.document?.text ?? '',
				)),
			},
		})
		return submission.reply()
	} else if (submission.value.intent === 'restart-instructions') {
		const courseModuleSession = await prisma.courseModuleSession.findUnique({
			where: { id: submission.value.courseModuleSessionId },
			include: {
				courseModule: { include: { instructions: true, tutor: true } },
			},
		})

		await prisma.$transaction([
			prisma.courseModuleSessionMessage.deleteMany({
				where: {
					courseModuleSessionId: submission.value.courseModuleSessionId,
				},
			}),
			prisma.courseModuleSession.update({
				where: courseModuleSessionWhere,
				data: {
					instructionsCompleted: 0,
					...(await createPromptMessage(
						courseModuleSession?.courseModule.instructions ?? [],
						0,
						submission.value.text ?? '',
					)),
				},
			}),
		])
		return submission.reply()
	} else if (submission.value.intent === 'delete-document-comment') {
		invariant(submission.value.commentId, 'Missing `commentId`')

		await prisma.courseModuleSession.update({
			where: courseModuleSessionWhere,
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

		await prisma.courseModuleSession.update({
			where: courseModuleSessionWhere,
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

		await prisma.courseModuleSession.update({
			where: courseModuleSessionWhere,
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

		const courseModuleSession = await prisma.courseModuleSession.findFirst({
			where: courseModuleSessionWhere,
			include: {
				courseModule: { include: { instructions: true, tutor: true } },
				messages: true,
				document: true,
			},
		})

		const instruction =
			courseModuleSession?.courseModule.instructions[
				courseModuleSession?.instructionsCompleted
			]

		if (!instruction) {
			throw new Error('No current instruction found')
		}

		const systemPrompt = `instructions = ###
You are a tutor who helps users work through course material.
You encouraging understanding and improvement.
You never ask the user for "what's the next step" or similar. You always know what is next.
You ask more questions than you answer, though you will provide factual information when requested.
You are supportive, instructive, and witty, enhancing the user's learning experience and confidence.
Your response should be no longer than 3 sentences exactly.
You don't create, write, or make content for the user.
You pretend to now know the answer_key nor that you know there even is an answer. However, you can guide the user toward the answer_key.

${courseModuleSession?.courseModule.tutor?.instructions ?? ''}

${
	instruction.interactiveType === 'answer'
		? `If the user_input is a question or request for help, then respond with a helpful answer or explanation no longer than 4 sentences long. Once you have answered the user's question, ask them if that answered the question. If yes, direct them to continue working toward the answer. Don't disclose the answer. If no, ask them to clarify or provide more information.
Else if the user_input is a statement, or comment, respond accordingly.
Else if the user_input is a sign of completion (e.g. "I'm done"), then do the following, step-by-step:
1. Compare the user_content with the answer_key and then...
2. Your response should be an aswer to this question: does the user_content contain a value that satisifes the answer_key requirements? (not your response)
- If it does, respond with "answer_satisfied" character for character.
- If it doesn't, respond with feedback to guide the student closer to the answer_key without disclosing it directly.
- Your hint should aim to facilitate learning.
- Never disclose the answer_key directly
- Your response should be no more than 2 sentences long, max. No exceptions.
- Ask questions to guide the user to the answer_key.`
		: ''
}
###

initial prompt given to the user = ###
${instruction.prompt}
###
${
	instruction.interactiveType === 'answer'
		? `answer_key = ###
${instruction.answerKey}
###`
		: ''
}
`

		const userPrompt = `user_content = ###
${courseModuleSession.document?.text ?? ''}
###
user_input = ###
${submission.value.response ?? ''}
###`

		await prisma.courseModuleSession.update({
			where: courseModuleSessionWhere,
			data: {
				messages: {
					create: [
						{
							content: submission.value.response,
							context: submission.value.text,
							instructionId: instruction.id,
							factCheckPrompt: userPrompt,
							agent: 'user',
						},
					],
				},
			},
		})

		const messages = courseModuleSession.messages
			.filter(m => m.instructionId === instruction.id)
			.map(m => ({
				role: m.agent === 'user' ? 'user' : ('assistant' as any),
				content:
					m.agent === 'user' ? m.factCheckPrompt ?? m.content : m.content,
				name: m.agent,
			}))
			.slice(1)
			.concat([{ role: 'user' as any, content: userPrompt, name: 'user' }])

		const hasAnswerKey = instruction.answerKey?.replace(/\n/g, '')
		const message = hasAnswerKey
			? await getLLMCompletion({
					model: 'claude-3-opus-20240229',
					messages,
					system: systemPrompt,
					maxTokens: 500,
				})
			: COMPLETION_TEXT

		if (message === COMPLETION_TEXT) {
			const courseModuleSession = await prisma.courseModuleSession.findUnique({
				where: courseModuleSessionWhere,
				include: {
					messages: true,
					courseModule: { include: { instructions: true, tutor: true } },
					document: true,
				},
			})

			invariant(courseModuleSession, 'No module session found')

			if (instruction.concludingPrompt?.length) {
				await prisma.courseModuleSession.update({
					where: courseModuleSessionWhere,
					data: {
						messages: {
							create: {
								agent: 'assistant',
								instructionId: instruction.id,
								context: courseModuleSession.document?.text ?? '',
								content:
									instruction.concludingPromptType ===
									'hardcoded-concluding-prompt'
										? instruction.concludingPrompt
										: await getLLMCompletion({
												model: 'claude-3-opus-20240229',
												system: `You are a tutor. Your response should wrap up the tutoring session.`,
												messages: courseModuleSession.messages
													.filter(m => m.instructionId === instruction.id)
													.map((m, i) => ({
														role:
															m.agent === 'user'
																? 'user'
																: ('assistant' as any),
														content:
															m.agent === 'user'
																? (i === courseModuleSession.messages.length - 1
																		? m.factCheckPrompt +
																			(instruction.concludingPrompt ?? '')
																		: m.factCheckPrompt) ?? m.content
																: m.content,
														name: m.agent,
													}))
													.slice(1),
											}),
							},
						},
					},
				})
			}

			await prisma.courseModuleSession.update({
				where: { id: courseModuleSession.id },
				data: {
					instructionsCompleted: { increment: 1 },
					...(await createPromptMessage(
						courseModuleSession.courseModule.instructions,
						courseModuleSession.instructionsCompleted + 1,
						courseModuleSession.document?.text ?? '',
					)),
				},
			})
		} else {
			await prisma.courseModuleSession.update({
				where: courseModuleSessionWhere,
				data: {
					messages: {
						create: [
							{
								content: message,
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
	const { courseModule, courseModuleSession } = useLoaderData<typeof loader>()
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
						documentId: courseModuleSession.documentId!,
						content: fetcher.formData?.get('content') as string,
						highlightId: fetcher.formData?.get('highlightId') as string,
						userId: user.id,
						user: user as any,
						responses: [] as any[],
					},
				]
			: []
	const comments =
		courseModuleSession.document?.comments.concat(newComment) ?? []

	const currentInstruction =
		courseModule.instructions[courseModuleSession.instructionsCompleted]
	const hasNextInstruction =
		!!courseModule.instructions[courseModuleSession.instructionsCompleted + 1]

	const isResponding =
		fetcher.formData &&
		!fetcher.formData.get('intent') &&
		!!fetcher.formData.get('response')

	const messages = isResponding
		? courseModuleSession.messages.concat({
				id: 'unknown',
				createdAt: new Date(),
				courseModuleSessionId: params.id,
				agent: 'user',
				content: fetcher.formData!.get('response'),
				responses: [],
			} as any)
		: courseModuleSession.messages

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
						{courseModuleSession.instructionsCompleted ===
						courseModule.instructions.length
							? 'Completed'
							: 'Progress'}
					</p>
					<div className="h-2 w-full rounded-full border bg-muted">
						<Tooltip
							text={`${courseModuleSession.instructionsCompleted} of ${courseModule.instructions.length}`}
						>
							<div
								className="h-full rounded-full bg-primary transition-all duration-200 ease-in-out"
								style={{
									width: `${Math.max(
										5,
										(courseModuleSession.instructionsCompleted /
											courseModule.instructions.length) *
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
									formData.append(
										'text',
										courseModuleSession.document?.text ?? '',
									)
									formData.append(
										'courseModuleSessionId',
										courseModuleSession.id,
									)
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
				className="no-scrollbar flex h-[calc(100vh-265px)] flex-col gap-3 overflow-scroll px-3 py-2 md:h-full"
				ref={messagesRef}
				id="course-module-session-messages"
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
							{message.agent === 'assistant' ? (
								parseAIResponse(message.content)
							) : (
								<p>{message.content}</p>
							)}
						</div>
					))}
				{fetcher.state !== 'idle' && isResponding ? <ChatPending /> : null}
			</div>
			{!currentInstruction ? (
				<div className="border-t p-2">
					<p className="text-center text-sm text-muted-foreground">
						You have completed all the instructions in this module.
					</p>
				</div>
			) : null}
			{currentInstruction?.answerType === 'textarea' ||
			currentInstruction.interactiveType === 'dialogue' ? (
				<div className="flex w-full flex-col px-3">
					{currentInstruction.interactiveType === 'dialogue' &&
					hasNextInstruction ? (
						<Button
							variant="link"
							className="w-fit p-0 text-muted-foreground"
							size="sm"
							onClick={e => {
								e.preventDefault()
								const formData = new FormData()
								formData.append('intent', 'complete-current-instruction')
								formData.append('courseModuleSessionId', courseModuleSession.id)
								fetcher.submit(formData, { method: 'POST' })
							}}
						>
							Next step <ArrowRightIcon className="ml-1.5" />
						</Button>
					) : null}
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
						formData.append('text', courseModuleSession.document?.text ?? '')
						formData.append('response', opt)
						formData.append('courseModuleSessionId', courseModuleSession.id)
						fetcher.submit(formData, { method: 'POST' })
					}}
				/>
			) : null}
		</div>
	)

	const Editor = (
		<div className="w-full overflow-hidden border-r font-times md:h-full [&>div:nth-child(2)>div]:h-[calc(100vh-133px)] [&>div:nth-child(2)>div]:overflow-scroll [&>div:nth-child(2)>div]:p-5 focus-visible:[&>div:nth-child(2)>div]:outline-none md:[&>div:nth-child(2)>div]:h-[calc(100vh-93px)]">
			<TiptapEditor
				initialContent={courseModuleSession.document?.html}
				onHighlight={({ highlightId, content }) => {
					const formData = new FormData()
					formData.append('content', content)
					formData.append('highlightId', highlightId)
					formData.append('courseModuleSessionId', courseModuleSession.id)
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
					formData.append('courseModuleSessionId', courseModuleSession.id)
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
							moduleSessionId={courseModuleSession.id}
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
			<input
				name="courseModuleSessionId"
				value={courseModuleSession.id}
				type="hidden"
			/>
			<input
				name="text"
				value={courseModuleSession.document?.text ?? 'none'}
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
									: `/app/courses/${courseModule.courseId}`,
							)
						}}
					>
						<ArrowLeft className="h-4" />
						{studentProfileId ? 'Back' : 'Home'}
					</Button>
					<h4>{courseModule.title}</h4>
					{studentProfileId ? (
						<Badge variant="info-outlined" className="md:text-md text-xs">
							{isMobile
								? courseModuleSession.user.name
								: `Viewing work by ${courseModuleSession.user.name}`}
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
