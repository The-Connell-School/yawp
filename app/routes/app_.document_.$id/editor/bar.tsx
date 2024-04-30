import { useCurrentEditor } from '@tiptap/react'
import { MessageCircleIcon } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { v4 } from 'uuid'
import { DotsHorizontalIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu'
import { Tooltip } from '#app/components/ui/tooltip'
import { camelCase } from '#app/utils/camelCase'
import { cn } from '#app/utils/misc'
import { type Command, commands, COMMAND_STYLE } from './commands'

const DROPDOWN_WIDTH = 32
const BUTTON_WIDTH = 32
const GAP_WIDTH = 3
const PADDING = 8

export type BarProps = {
	onHighlight?: (params: { highlightId: string; content: string }) => void
}

export const Bar = ({ onHighlight }: BarProps) => {
	const [visibleCommands, setVisibleCommands] = useState(commands)
	const [hiddenCommands, setHiddenCommands] = useState<Command[]>([])
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const updateButtonVisibility = () => {
			if (containerRef.current) {
				const containerWidth = containerRef.current.offsetWidth
				const maxButtons =
					Math.floor(
						(containerWidth - PADDING - DROPDOWN_WIDTH) /
							(BUTTON_WIDTH + GAP_WIDTH),
					) - 1
				if (commands.length > maxButtons) {
					setVisibleCommands(commands.slice(0, maxButtons))
					setHiddenCommands(commands.slice(maxButtons))
				} else {
					setVisibleCommands(commands)
					setHiddenCommands([])
				}
			}
		}

		updateButtonVisibility()
		window.addEventListener('resize', updateButtonVisibility)

		return () => window.removeEventListener('resize', updateButtonVisibility)
	}, [])

	const { editor } = useCurrentEditor()

	if (!editor) {
		return null
	}

	return (
		<div
			className="bg-muted-background flex w-full items-center gap-0.5 border-b p-1"
			ref={containerRef}
		>
			{visibleCommands.map(
				({ icon, label, command, params, activeId, override }) =>
					override?.(editor) ?? (
						<Tooltip text={label} delayDuration={300} key={label}>
							<div
								// @ts-ignore
								onClick={() => editor.chain().focus()[command](params).run()}
								className={cn(COMMAND_STYLE, {
									'bg-muted': editor.isActive(
										activeId ?? camelCase(label ?? ''),
										params,
									),
								})}
							>
								{icon ?? label}
							</div>
						</Tooltip>
					),
			)}
			<Tooltip text="Comment" delayDuration={300}>
				<div
					onClick={async () => {
						const isHighlighted = editor.isActive('highlight')

						if (isHighlighted) {
							editor.chain().focus().unsetHighlight().run()
						} else {
							const id = v4()
							const { from, to } = editor.state.selection
							const content = editor.state.doc.textBetween(from, to, ' ')

							if (!content) return

							editor.chain().focus().setHighlight().run()
							editor.commands.updateAttributes('highlight', { id })
							onHighlight?.({ highlightId: id, content })
						}
					}}
					className={cn(COMMAND_STYLE, {
						'bg-muted': editor.isActive('highlight'),
					})}
				>
					<MessageCircleIcon className="h-4 w-4" />
				</div>
			</Tooltip>
			{hiddenCommands.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={e => e.preventDefault()}
						>
							<DotsHorizontalIcon />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="flex w-fit flex-col gap-1">
						{hiddenCommands.map(
							({ icon, label, command, params, activeId }) => (
								<DropdownMenuItem
									key={label}
									onClick={e => {
										e.preventDefault()
										e.stopPropagation()
										// @ts-ignore
										editor.chain().focus()[command](params).run()
									}}
									className={cn(COMMAND_STYLE, 'flex items-center gap-3', {
										'bg-muted': editor.isActive(
											activeId ?? camelCase(label ?? ''),
											params,
										),
									})}
								>
									<span>{icon ?? label}</span>
									<span>{label}</span>
								</DropdownMenuItem>
							),
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	)
}
