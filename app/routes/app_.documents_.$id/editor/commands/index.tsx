import {
	type ChainedCommands,
	type Editor as TiptapEditor,
} from '@tiptap/react'
import {
	BoldIcon,
	ItalicIcon,
	StrikethroughIcon,
	Trash,
	Heading1Icon,
	Heading2Icon,
	Heading3Icon,
	AlignVerticalSpaceAround,
	Check,
	ListOrderedIcon,
	QuoteIcon,
	Undo2Icon,
	Redo2Icon,
} from 'lucide-react'
import { type ReactNode } from 'react'
import { ListBulletIcon, DividerHorizontalIcon } from '#app/components/icons.js'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from '#app/components/ui/dropdown-menu.js'
import { Tooltip } from '#app/components/ui/tooltip.js'
import { cn } from '#app/utils/misc.js'

export const COMMAND_STYLE =
	'p-2 hover:bg-muted cursor-pointer rounded-sm transition-colors'

export type Command = {
	icon?: ReactNode
	label?: string
	command?: keyof ChainedCommands
	params?: any
	checkDisabled?: boolean
	disableActiveStyles?: boolean
	activeId?: string
	override?: (editor: TiptapEditor) => ReactNode
}

export const commands: Command[] = [
	{
		icon: <BoldIcon className="h-4 w-4" />,
		label: 'Bold',
		command: 'toggleBold',
		checkDisabled: true,
	},
	{
		icon: <ItalicIcon className="h-4 w-4" />,
		label: 'Italic',
		command: 'toggleItalic',
		checkDisabled: true,
	},
	{
		icon: <StrikethroughIcon className="h-4 w-4" />,
		label: 'Strike',
		command: 'toggleStrike',
		checkDisabled: true,
	},
	{
		icon: <Trash className="h-4 w-4" />,
		label: 'Clear marks',
		command: 'unsetAllMarks',
		disableActiveStyles: true,
	},
	{
		icon: <p className="px-1 text-xs">P</p>,
		label: 'Paragraph',
		command: 'setParagraph',
	},
	{
		label: 'H1',
		icon: <Heading1Icon className="h-4 w-4" />,
		command: 'toggleHeading',
		activeId: 'heading',
		params: { level: 1 },
	},
	{
		label: 'H2',
		icon: <Heading2Icon className="h-4 w-4" />,
		command: 'toggleHeading',
		activeId: 'heading',
		params: { level: 2 },
	},
	{
		label: 'H3',
		icon: <Heading3Icon className="h-4 w-4" />,
		command: 'toggleHeading',
		activeId: 'heading',
		params: { level: 3 },
	},
	{
		override: editor => (
			<DropdownMenu key="spacing">
				<Tooltip text="Spacing" delayDuration={300}>
					<DropdownMenuTrigger>
						<div className={COMMAND_STYLE}>
							<AlignVerticalSpaceAround className="h-4 w-4" />
						</div>
					</DropdownMenuTrigger>
				</Tooltip>
				<DropdownMenuContent className="grid w-fit min-w-0 gap-1">
					{['1', '1.15', '1.5', '2'].map((height) => (
						<DropdownMenuItem
							key={height}
							onClick={e => {
								e.preventDefault()
								e.stopPropagation()
								editor
									.chain()
									.focus()
									.setLineHeight(height as any)
									.run()
							}}
							className={cn(COMMAND_STYLE, 'flex w-[65px] items-center gap-3', {
								'bg-muted': editor.isActive('paragraph', {
									lineHeight: height,
								}),
							})}
						>
							<Check
								className={cn('h-4 w-4', {
									invisible: !editor.isActive('paragraph', {
										lineHeight: height,
									}),
								})}
							/>
							<span>{height}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		),
	},
	{
		icon: <ListBulletIcon className="h-4 w-4" />,
		label: 'Bullet list',
		command: 'toggleBulletList',
	},
	{
		icon: <ListOrderedIcon className="h-4 w-4" />,
		label: 'Ordered list',
		command: 'toggleOrderedList',
	},
	{
		icon: <QuoteIcon className="h-4 w-4" />,
		label: 'Blockquote',
		command: 'toggleBlockquote',
	},
	{
		icon: <DividerHorizontalIcon className="h-4 w-4" />,
		label: 'Horizontal rule',
		command: 'setHorizontalRule',
		disableActiveStyles: true,
	},
	{
		icon: <Undo2Icon className="h-4 w-4" />,
		label: 'Undo',
		command: 'undo',
	},
	{
		icon: <Redo2Icon className="h-4 w-4" />,
		label: 'Redo',
		command: 'redo',
	},
]
