import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { button } from '#app/components/ui/button'
import { cn } from '#app/utils/misc'

export const SelectButtons = ({
	options,
	children,
	onClick,
}: {
	options: string
	children: React.ReactNode
	onClick: (opt: string) => void
}) => {
	const [isAskingQuestion, setIsAskingQuestion] = useState(true)

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
			{children}
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
		</div>
	)
}
