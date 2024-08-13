import {
	type CourseModuleSession as PrismaCMS,
	type CourseModuleInstruction,
	type CourseModuleSessionMessage,
} from '@prisma/client'
import { useFetcher, useNavigate, useSearchParams } from '@remix-run/react'
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	AudioLines,
	PauseCircleIcon,
	PlayCircle,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { Button } from '#app/components/ui/button'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '#app/components/ui/popover'
import { Slider } from '#app/components/ui/slider.js'
import { Switch } from '#app/components/ui/switch'
import { Tooltip } from '#app/components/ui/tooltip'
import { useAudio } from '#app/hooks/useAudio.js'
import { cn } from '#app/utils/misc'
import { timeAgo } from '#app/utils/timeAgo/timeAgo'
import { Loading } from './loading'
import { ResponseBar } from './response-bar'

type Props = {
	docId: string
	nextCmId?: string
	cms: JsonifyObject<
		PrismaCMS & {
			courseModule: { instructions: CourseModuleInstruction[] }
			messages: CourseModuleSessionMessage[]
		}
	>
}

function base64ToArrayBuffer(base64: string) {
	var binary_string = window.atob(base64)
	var len = binary_string.length
	var bytes = new Uint8Array(len)
	for (var i = 0; i < len; i++) {
		bytes[i] = binary_string.charCodeAt(i)
	}
	return bytes.buffer
}

export const Tutor = ({ cms, nextCmId, docId }: Props) => {
	const tutorResponseFetcher = useFetcher<{ error?: string; audio?: string }>()
	const incrementInstructionFetcher = useFetcher()
	const advanceCourseModuleFetcher = useFetcher()
	const audioFetcher = useFetcher<{ audio: string }>()
	const messagesRef = useRef<HTMLDivElement>(null)
	const audioRef = useRef<HTMLAudioElement>(null)
	const totalInstructions = cms.courseModule.instructions.length
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const shouldPlayAudio = searchParams.get('spa') === '1'
	const audioControls = useAudio(audioRef.current)

	const [speechEnabled, setSpeechEnabled] = useLocalStorage(
		'speechEnabled',
		false,
	)
	const [speechSpeed, setSpeechSpeed] = useLocalStorage('speechSpeed', 1)

	const finishedCms =
		cms.instructionsCompleted === cms.courseModule.instructions.length

	const instruction =
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
			{ response, cmsId: cms.id, speechEnabled, speechSpeed: '1.5' },
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

	const decrementInstruction = () => {
		incrementInstructionFetcher.submit(
			{ 'instructionsCompleted.decrement': 1 },
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

	const playBase64StringAudio = (base64: string) => {
		const audioData = base64
		const audioArrayBuffer = base64ToArrayBuffer(audioData)
		const audioBlob = new Blob([audioArrayBuffer])
		const audioUrl = URL.createObjectURL(audioBlob)
		if (audioRef.current) {
			audioRef.current.src = audioUrl
			audioRef.current.load()
			audioRef.current.play()
			audioRef.current.playbackRate = speechSpeed
			audioRef.current.onended = () => audioControls.setIsPlaying(false)
		}
	}

	const messages = cms.messages
		.filter(m => ['user', 'assistant'].includes(m.agent))
		.concat(optimisticMessage ?? [])

	useEffect(() => {
		messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
	}, [messages])

	useEffect(() => {
		if (speechEnabled && tutorResponseFetcher.data?.audio?.length) {
			playBase64StringAudio(tutorResponseFetcher.data!.audio!)
			audioControls.setIsPlaying(true)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tutorResponseFetcher.data, speechEnabled])

	useEffect(() => {
		if (shouldPlayAudio) {
			const { pathname, search } = window.location
			const searchParams = new URLSearchParams(search)
			searchParams.delete('spa')
			navigate(`${pathname}?${searchParams}`, { replace: true })

			if (speechEnabled) {
				audioFetcher.load(`/api/domain/audio/${instruction.id}`)
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [shouldPlayAudio, navigate])

	useEffect(() => {
		if (audioFetcher.data?.audio) {
			playBase64StringAudio(audioFetcher.data.audio)
			audioControls.setIsPlaying(true)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [audioFetcher.data])

	return (
		<div className="flex w-full flex-col border-r pb-2 md:w-3/5">
			<audio ref={audioRef} hidden />
			<div className="flex items-center justify-between gap-8 border-b py-1 pl-4 pr-2">
				<div className="flex h-[32px] w-full items-center gap-4">
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
					<Popover>
						<PopoverTrigger asChild>
							<Button variant="ghost" size="icon-sm" className="min-w-8">
								<AudioLines
									size={20}
									strokeWidth={2.5}
									className={
										audioControls.isPlaying ? 'text-primary' : undefined
									}
								/>
							</Button>
						</PopoverTrigger>
						<PopoverContent align="end" className="-mt-0.5">
							<p className="mb-2 font-bold">Audio</p>
							<div className="mb-3 flex items-center justify-between gap-2">
								<p className="text-sm">Enabled</p>
								<Switch
									checked={speechEnabled}
									onCheckedChange={setSpeechEnabled}
								/>
							</div>
							<div className="border-b-black-100 my-2 border-b" />
							<div
								className={cn(
									'grid grid-cols-4',
									!speechEnabled && 'pointer-events-none opacity-50',
								)}
							>
								<div className="flex flex-col items-center">
									<p className="mb-0.5 text-sm text-muted-foreground">
										{audioControls.isPlaying ? 'Playing...' : 'Stopped'}
									</p>
									<Button
										onClick={audioControls.togglePlayPause}
										size="sm"
										variant="ghost"
										disabled={audioRef.current?.src === ''}
									>
										{audioControls.isPlaying ? (
											<PauseCircleIcon />
										) : (
											<PlayCircle />
										)}
									</Button>
								</div>
								<div className="col-span-3 w-full">
									<p className="w-full text-center text-sm text-muted-foreground">
										Speed
									</p>
									<div className="mt-4 flex items-end">
										<Slider
											min={0.9}
											max={2.1}
											step={0.2}
											value={[speechSpeed]}
											onValueChange={([v]) => {
												audioControls.setPlaybackRate(v)
												setSpeechSpeed(v)
											}}
										/>
									</div>
								</div>
							</div>
						</PopoverContent>
					</Popover>
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
				<div className="flex flex-col items-center gap-4 border-t p-2 px-4">
					<p className="text-center text-sm text-muted-foreground">
						This will take you to the next step of the writing process. Click
						next again only if you are ready to move on, or click back to stay
						on this step.
					</p>
					<div className="flex items-center gap-2">
						<Button onClick={decrementInstruction} variant="secondary">
							<ArrowLeftIcon size={18} className="mr-2" /> Back
						</Button>
						<Button onClick={advanceToNextCourseModule}>
							Next <ArrowRightIcon size={18} className="ml-2" />
						</Button>
					</div>
				</div>
			) : finishedCms ? (
				<p className="border-t p-2 text-center text-sm text-muted-foreground">
					You have completed all the modules in this course.
				</p>
			) : (
				<ResponseBar
					options={instruction.answerTypeOptions}
					respond={respond}
					canAskQuestion={
						!!instruction.canAskQuestion ||
						instruction.interactiveType === 'dialogue'
					}
					advanceInstructionLabel={
						instruction.interactiveType === 'dialogue'
							? instruction.nextInstructionBtnLabel
							: undefined
					}
					advanceInstruction={
						instruction.interactiveType === 'dialogue'
							? incrementInstruction
							: undefined
					}
				/>
			)}
		</div>
	)
}
