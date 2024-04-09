import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { button } from '#app/components/ui/button'
import { cn } from '#app/utils/misc'
import { ChatInput } from './chat-input'

export const SelectButtons = ({
	options,
	textareaProps,
	canAskQuestion,
	onSubmit,
	onClick,
}: {
	options: string
	canAskQuestion?: boolean
	textareaProps?: any
	onSubmit?: (form: any) => void
	onClick: (opt: string) => void
}) => {
	const [isAskingQuestion, setIsAskingQuestion] = useState(false)

	return isAskingQuestion ? (
		<div className="flex w-full items-center justify-center px-3">
			<div
				className={cn(
					button({
						size: 'lg',
						className: 'cursor-pointer px-2',
						variant: 'secondary',
					}),
				)}
				onClick={() => setIsAskingQuestion(false)}
			>
				<ChevronLeft />
			</div>
			<div className="flex w-full items-center justify-center px-3">
				<ChatInput
					textareaProps={textareaProps}
					onSubmit={form => {
						onSubmit?.(form)
						setIsAskingQuestion(false)
					}}
				/>
			</div>
		</div>
	) : (
		<div className="flex flex-wrap items-center justify-center gap-2 border-t p-2 pb-5 md:pb-4">
			{options?.split(',').map(opt => (
				<div
					key={opt}
					className={cn(
						button({
							size: 'lg',
							className: 'cursor-pointer text-lg',
						}),
					)}
					onClick={() => onClick?.(opt)}
				>
					{opt}
				</div>
			))}
			{canAskQuestion ? (
				<div
					className={cn(
						button({
							size: 'lg',
							className: 'cursor-pointer text-lg',
							variant: 'secondary',
						}),
					)}
					onClick={() => setIsAskingQuestion(true)}
				>
					Ask a question
				</div>
			) : null}
		</div>
	)
}
