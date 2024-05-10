import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { RichTextarea } from '#app/components/rich-textarea'
import { Button } from '#app/components/ui/button'

type Props = {
	options: string
	canAskQuestion?: boolean
	respond: (response: string) => void
}

export const HardcodedResponseOptions = ({
	options,
	canAskQuestion,
	respond,
}: Props) => {
	const [isAskingQuestion, setIsAskingQuestion] = useState(false)

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
				<Button
					key={opt}
					size="lg"
					className="text-lg"
					onClick={() => respond(opt)}
				>
					{opt}
				</Button>
			))}
			{canAskQuestion ? (
				<Button
					size="lg"
					variant="secondary"
					className="text-lg"
					onClick={() => setIsAskingQuestion(true)}
				>
					Ask a question
				</Button>
			) : null}
		</div>
	)
}
