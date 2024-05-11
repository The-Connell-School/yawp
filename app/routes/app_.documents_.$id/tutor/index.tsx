import {
	type CourseModuleSession as PrismaCMS,
	type CourseModuleInstruction,
	type CourseModuleSessionMessage,
} from '@prisma/client'
import { useFetcher } from '@remix-run/react'
import { ArrowRightIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { RichTextarea } from '#app/components/rich-textarea.js'
import { Button } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { InstructionInteraction } from '#app/routes/api+/domain+/tutor-response.js'
import { cn } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo/timeAgo'
import { HardcodedResponseOptions } from './hardcoded-response-options'
import { Loading } from './loading'

type Props = {
	context: string | null
	totalInstructions: number
	cmss: JsonifyObject<
		PrismaCMS & {
			courseModule: { instructions: CourseModuleInstruction[] }
			messages: CourseModuleSessionMessage[]
		}
	>[]
}

export const Tutor = ({ context, cmss, totalInstructions }: Props) => {
	const tutorResponseFetcher = useFetcher<{ error?: string }>()
	const incrementInstructionFetcher = useFetcher()
	const messagesRef = useRef<HTMLDivElement>(null)
	const currentCms = cmss[0]

	const finishedCurrentCmsInstructions =
		currentCms.instructionsCompleted ===
		currentCms.courseModule.instructions.length

	const { answerType, answerTypeOptions, interactiveType } =
		currentCms.courseModule.instructions[currentCms.instructionsCompleted] ?? {}

	const hasNextInstruction =
		currentCms.instructionsCompleted + 1 < totalInstructions

	const completedInstructions = cmss.reduce(
		(acc, cms) => acc + cms.instructionsCompleted,
		0,
	)
	const completedInstructionsPct = Math.min(
		(completedInstructions / totalInstructions) * 100,
		100,
	)

	const optimistic = tutorResponseFetcher.formData
	const optimisticMessage = optimistic
		? ({
				agent: 'user',
				createdAt: new Date(),
				content: optimistic.get('response'),
			} as any)
		: null

	const respond = (response: string) => {
		tutorResponseFetcher.submit(
			{ context, response, cmsId: currentCms.id },
			{ method: 'POST', action: '/api/domain/tutor-response' },
		)
	}

	const incrementInstruction = () => {
		incrementInstructionFetcher.submit(
			{ 'instructionsCompleted.increment': 1 },
			{
				method: 'POST',
				action: `/api/model/course-module-session/${currentCms.id}`,
			},
		)
	}

	const messages = currentCms.messages
		.filter(m => ['user', 'assistant'].includes(m.agent))
		.concat(optimisticMessage ?? [])

	useEffect(() => {
		messagesRef.current?.scrollTo({
			top: messagesRef.current.scrollHeight,
			behavior: 'smooth',
		})
	}, [messages])

	return (
		<div className="flex w-full flex-col border-r pb-2 md:w-3/5">
			<div className="flex items-center justify-between gap-8 border-b py-1 pl-4 pr-4">
				<div className="flex h-[32px] w-full items-center gap-2">
					<p className="min-w-fit text-sm">
						{completedInstructionsPct === 100 ? 'Completed' : 'Progress'}
					</p>
					<div className="h-2 w-full rounded-full border bg-muted">
						<Tooltip text={`${completedInstructions} of ${totalInstructions}`}>
							<div
								className="h-full rounded-full bg-primary transition-all duration-200 ease-in-out"
								style={{ width: `${completedInstructionsPct}%` }}
							/>
						</Tooltip>
					</div>
				</div>
			</div>
			<div
				className="no-scrollbar flex grow flex-col gap-3 overflow-scroll px-3 py-2 md:h-full"
				ref={messagesRef}
				id="course-module-session-messages"
			>
				{messages.map(message => (
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
						<p className="whitespace-pre-wrap">{message.content}</p>
					</div>
				))}
				{tutorResponseFetcher.state !== 'idle' && optimistic ? (
					<Loading />
				) : null}
				{tutorResponseFetcher.data?.error ? (
					<p className="w-full rounded-lg border-destructive bg-destructive/5 p-3 text-destructive">
						{tutorResponseFetcher.data.error}
					</p>
				) : null}
			</div>
			{!hasNextInstruction && finishedCurrentCmsInstructions ? (
				<p className="border-t p-2 text-center text-sm text-muted-foreground">
					You have completed all the modules in this course.
				</p>
			) : finishedCurrentCmsInstructions ? (
				<div className="flex items-center gap-2 border-t p-2">
					<p className="text-sm text-muted-foreground">
						You have completed all the instructions in this module.
					</p>
					<Button onClick={incrementInstruction}>
						Next <ArrowRightIcon />
					</Button>
				</div>
			) : interactiveType === InstructionInteraction.Dialogue ||
			  answerType === 'textarea' ? (
				<div className="flex w-full flex-col px-3">
					{hasNextInstruction && interactiveType === 'dialogue' ? (
						<Button
							variant="link"
							className="w-fit p-0 text-muted-foreground"
							size="sm"
							onClick={incrementInstruction}
						>
							{hasNextInstruction ? 'Next step' : 'Finish'}{' '}
							<ArrowRightIcon className="ml-1.5" />
						</Button>
					) : null}
					<RichTextarea onCmdEnter={respond} className="text-base" />
				</div>
			) : answerTypeOptions ? (
				<HardcodedResponseOptions
					options={answerTypeOptions}
					respond={respond}
				/>
			) : null}
		</div>
	)
}
