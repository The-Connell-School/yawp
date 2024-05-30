import {
	CheckIcon,
	ChevronLeft,
	ChevronRightIcon,
	MessageCircleIcon,
} from 'lucide-react'
import { useState } from 'react'
import { RichTextarea } from '#app/components/rich-textarea'
import { Button } from '#app/components/ui/button'
import { Tooltip } from '#app/components/ui/tooltip.js'

type Props = {
	options: string | null
	canAskQuestion?: boolean
	advanceInstruction?: () => void
	respond: (response: string) => void
}

export const ResponseBar = ({
	options,
	canAskQuestion,
	advanceInstruction,
	respond,
}: Props) => {
	const [isAskingQuestion, setIsAskingQuestion] = useState(false)
	const [check, setCheck] = useState(false)

	return isAskingQuestion ? (
		<div className="flex w-full items-center justify-center px-3">
			<Button
				size="lg"
				variant="secondary"
				className="px-2"
				onClick={() => setIsAskingQuestion(false)}
			>
				<ChevronLeft />
			</Button>
			<div className="flex w-full items-center justify-center px-3">
				<RichTextarea onCmdEnter={respond} />
			</div>
		</div>
	) : (
		<div className="flex flex-wrap items-center justify-center gap-2 border-t p-2 pb-5 md:pb-4">
			{options?.split(',').map(opt => (
				<Button key={opt} className="text-lg" onClick={() => respond(opt)}>
					{opt}
				</Button>
			))}
			{canAskQuestion ? (
				<Button
					variant="secondary"
					className="flex items-center gap-2 text-lg"
					onClick={() => setIsAskingQuestion(true)}
				>
					<MessageCircleIcon />
					{options ? '' : 'Respond'}
				</Button>
			) : null}
			{advanceInstruction ? (
				<Tooltip
					text="Next step"
					delayDuration={200}
					open={check === true || undefined}
				>
					<Button
						variant={check ? 'success' : 'secondary'}
						size="icon"
						onClick={() => (check ? advanceInstruction() : setCheck(true))}
						onBlur={() => check && setCheck(false)}
					>
						{check ? <CheckIcon /> : <ChevronRightIcon />}
					</Button>
				</Tooltip>
			) : null}
		</div>
	)
}
