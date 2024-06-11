import {
	type CourseModuleSession as PrismaCMS,
	type CourseModuleInstruction,
	type CourseModuleSessionMessage,
} from '@prisma/client'
import { useFetcher } from '@remix-run/react'
import { ArrowRightIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip'
import { cn } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo/timeAgo'
import { Loading } from './loading'
import { ResponseBar } from './response-bar'

type Props = {
	context: string | null
	docId: string
	nextCmId?: string
	cms: JsonifyObject<
		PrismaCMS & {
			courseModule: { instructions: CourseModuleInstruction[] }
			messages: CourseModuleSessionMessage[]
		}
	>
}

export const Tutor = ({ context, cms, nextCmId, docId }: Props) => {
	const tutorResponseFetcher = useFetcher<{ error?: string }>()
	const incrementInstructionFetcher = useFetcher()
	const advanceCourseModuleFetcher = useFetcher()
	const messagesRef = useRef<HTMLDivElement>(null)
	const totalInstructions = cms.courseModule.instructions.length

	const finishedCms =
		cms.instructionsCompleted === cms.courseModule.instructions.length

	const { answerTypeOptions, interactiveType, canAskQuestion } =
		cms.courseModule.instructions[cms.instructionsCompleted] ?? {}

	const completedInstructionsPct = Math.min(
		(cms.instructionsCompleted / totalInstructions) * 100,
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
			{ context, response, cmsId: cms.id },
			{ method: 'POST', action: '/api/domain/tutor-response' },
		)
	}

	const incrementInstruction = () => {
		incrementInstructionFetcher.submit(
			{ 'instructionsCompleted.increment': 1 },
			{
				method: 'POST',
				action: `/api/model/course-module-session/${cms.id}`,
			},
		)
	}

	const advanceToNextCourseModule = () => {
		advanceCourseModuleFetcher.submit(
			{ courseModuleId: nextCmId ?? '', documentId: docId },
			{
				method: 'POST',
				action: '/api/model/course-module-session',
			},
		)
	}

	const messages = cms.messages
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
						<Tooltip
							text={`${cms.instructionsCompleted} of ${totalInstructions}`}
						>
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
			{finishedCms && nextCmId ? (
				<div className="flex items-center gap-4 border-t p-2">
					<p className="text-sm text-muted-foreground">
						This will take you to the next step of the writing process. Click
						the arrow again only if you're sure you're ready to move on!
					</p>
					<Button onClick={advanceToNextCourseModule}>
						Next <ArrowRightIcon size={18} className="ml-2" />
					</Button>
				</div>
			) : finishedCms ? (
				<p className="border-t p-2 text-center text-sm text-muted-foreground">
					You have completed all the modules in this course.
				</p>
			) : (
				<ResponseBar
					options={answerTypeOptions}
					respond={respond}
					canAskQuestion={!!canAskQuestion || interactiveType === 'dialogue'}
					advanceInstruction={incrementInstruction}
				/>
			)}
		</div>
	)
}
