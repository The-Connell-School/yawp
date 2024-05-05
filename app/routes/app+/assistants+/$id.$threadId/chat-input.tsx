import { useRef, useEffect, useState } from 'react'
import { Tooltip } from '#app/components/ui/tooltip'
import { cn } from '#app/utils/misc'

type Props = {
	isDisabled?: boolean
	textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>
	onSubmit?: (formElement: HTMLFormElement) => void
}

export const ChatInput = ({ isDisabled, textareaProps, onSubmit }: Props) => {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [hasText, setHasText] = useState(false)

	useEffect(() => {
		if (textareaRef.current) {
			const lineHeight = parseFloat(
				getComputedStyle(textareaRef.current).lineHeight,
			)
			textareaRef.current.style.height = Math.max(50, lineHeight) + 'px'
		}
	}, [])

	const handleTextareaChange = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = '50px'
			textareaRef.current.style.height =
				Math.max(50, textareaRef.current.scrollHeight + 3) + 'px'

			setHasText(!!textareaRef.current.value)
		}
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && hasText) {
			event.preventDefault()

			if (event.currentTarget.form) {
				onSubmit?.(event.currentTarget.form)
			}

			textareaRef.current!.value = ''

			if (textareaRef.current) {
				const lineHeight = parseFloat(
					getComputedStyle(textareaRef.current).lineHeight,
				)
				textareaRef.current.style.height = Math.max(50, lineHeight) + 'px'
			}
		}
	}

	return (
		<div className="relative mx-auto flex w-full max-w-[700px] items-center">
			<textarea
				className="no-scrollbar my-auto h-[50px] max-h-[200px] min-h-[50px] w-full resize-none rounded-lg border border-foreground/20 bg-background p-3 pr-14 focus:border-foreground/30 focus:outline-0"
				placeholder="Send a message"
				ref={textareaRef}
				onChange={handleTextareaChange}
				onKeyDown={handleKeyDown}
				disabled={isDisabled}
				{...textareaProps}
			/>
			<Tooltip
				text="Type a message first"
				open={!hasText || isDisabled ? undefined : false}
				delayDuration={200}
			>
				<button
					type="submit"
					className={cn(
						'absolute bottom-2 right-2 cursor-pointer rounded-md bg-primary/80 p-2 text-background shadow transition hover:bg-primary/90 active:bg-primary dark:text-foreground',
						{
							'cursor-default bg-primary/20 text-opacity-10 hover:bg-primary/20 active:bg-primary/20':
								!hasText || isDisabled,
						},
					)}
					onClick={() => {
						setTimeout(() => {
							textareaRef.current!.value = ''
						}, 100)
					}}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						className="h-5 w-5"
					>
						<path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
					</svg>
				</button>
			</Tooltip>
		</div>
	)
}
