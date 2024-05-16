import { useRichTextarea } from '#app/hooks/useRichTextarea'
import { cn } from '#app/utils/misc'
import { Textarea, type TextareaProps } from './ui/textarea'
import { Tooltip } from './ui/tooltip'

export type RichTextareaProps = TextareaProps & {
	onCmdEnter?: (text: string) => void
}

export const RichTextarea = ({
	size,
	className,
	onCmdEnter,
	...textareaProps
}: RichTextareaProps) => {
	const height = size === 'sm' ? '40px' : '50px'
	const { textareaRef, handleKeyDown, handleTextareaChange, hasText } =
		useRichTextarea({ onCmdEnter, height })

	return (
		<div className="relative mx-auto flex w-full max-w-[700px] items-center">
			<Textarea
				className={cn(
					'no-scrollbar my-auto w-full resize-none rounded-lg border bg-background p-3 pr-14 focus:border-primary focus:outline-1 focus:outline-primary',
					className,
					{ 'p-2': size === 'sm' },
				)}
				style={{ height, maxHeight: '200px', minHeight: height }}
				size={size}
				placeholder="Ask a question or respond"
				ref={textareaRef}
				onChange={handleTextareaChange}
				onKeyDown={handleKeyDown}
				{...textareaProps}
			/>
			<Tooltip
				text="Type a message first"
				open={!hasText || textareaProps?.disabled ? undefined : false}
				delayDuration={200}
			>
				<button
					className={cn(
						'absolute bottom-2 right-2 cursor-pointer rounded-md bg-primary/80 p-2 text-background shadow transition hover:bg-primary/90 active:bg-primary dark:text-foreground',
						{
							'cursor-default bg-primary/20 text-opacity-10 hover:bg-primary/20 active:bg-primary/20':
								!hasText || textareaProps?.disabled,
							'bottom-1 right-1': size === 'sm',
						},
					)}
					onClick={() => {
						if (textareaRef.current?.value) {
							onCmdEnter?.(textareaRef.current.value)
							setTimeout(() => {
								textareaRef.current!.value = ''
							}, 100)
						}
					}}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'}
					>
						<path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
					</svg>
				</button>
			</Tooltip>
		</div>
	)
}
