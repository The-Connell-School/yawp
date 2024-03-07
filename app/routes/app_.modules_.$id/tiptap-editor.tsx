import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style'
import {
	EditorProvider,
	useCurrentEditor,
	type ChainedCommands,
	type Editor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
	AlignVerticalSpaceAround,
	BoldIcon,
	Check,
	Heading1Icon,
	Heading2Icon,
	Heading3Icon,
	ItalicIcon,
	ListOrderedIcon,
	MessageCircleIcon,
	QuoteIcon,
	Redo2Icon,
	StrikethroughIcon,
	Trash,
	Undo2Icon,
} from 'lucide-react'
import { useState, type ReactNode, useEffect, useRef } from 'react'
import { v4 } from 'uuid'
import {
	DividerHorizontalIcon,
	DotsHorizontalIcon,
	ListBulletIcon,
} from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu'
import { Tooltip } from '#app/components/ui/tooltip'
import { useDebounce } from '#app/hooks/useDebounce'
import { camelCase } from '#app/utils/camelCase'
import { cn } from '#app/utils/misc'
import { LineHeight } from './tiptap-extensions/line-height'

type onHighlight = ({
	highlightId,
	content,
}: {
	highlightId: string
	content: string
}) => void

const styleButtons: {
	icon?: ReactNode
	label?: string
	command?: keyof ChainedCommands
	params?: any
	checkDisabled?: boolean
	disableActiveStyles?: boolean
	activeId?: string
	override?: (editor: Editor) => ReactNode
}[] = [
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
			<DropdownMenu>
				<Tooltip text="Line Height" delayDuration={300}>
					<DropdownMenuTrigger>
						<div className={cn(styleBarItemStyle)}>
							<AlignVerticalSpaceAround className="h-4 w-4" />
						</div>
					</DropdownMenuTrigger>
				</Tooltip>
				<DropdownMenuContent className="grid w-fit min-w-0 gap-1">
					{['1', '1.5', '2'].map(height => (
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
							className={cn(
								styleBarItemStyle,
								'flex w-[65px] items-center gap-3',
								{
									[styleBarItemActiveStyle]: editor.isActive('paragraph', {
										lineHeight: height,
									}),
								},
							)}
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

const styleBarItemStyle: HTMLDivElement['className'] =
	'p-2 hover:bg-muted cursor-pointer rounded-sm transition-colors'
const styleBarItemActiveStyle: HTMLDivElement['className'] = 'bg-muted'

const DROPDOWN_WIDTH = 32
const BUTTON_WIDTH = 32
const GAP_WIDTH = 3
const PADDING = 8

const StyleBar = ({ onHighlight }: { onHighlight?: onHighlight }) => {
	const [visibleButtons, setVisibleButtons] =
		useState<typeof styleButtons>(styleButtons)
	const [hiddenButtons, setHiddenButtons] = useState<typeof styleButtons>([])
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
				if (styleButtons.length > maxButtons) {
					setVisibleButtons(styleButtons.slice(0, maxButtons))
					setHiddenButtons(styleButtons.slice(maxButtons))
				} else {
					setVisibleButtons(styleButtons)
					setHiddenButtons([])
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
			{visibleButtons.map(
				({ icon, label, command, params, activeId, override }) =>
					override?.(editor) ?? (
						<Tooltip text={label} delayDuration={300} key={label}>
							<div
								// @ts-ignore
								onClick={() => editor.chain().focus()[command](params).run()}
								className={cn(styleBarItemStyle, {
									[styleBarItemActiveStyle]: editor.isActive(
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
							editor.chain().focus().setHighlight().run()
							editor.commands.updateAttributes('highlight', { id })

							const { from, to } = editor.state.selection
							const content = editor.state.doc.textBetween(from, to, ' ')
							onHighlight?.({ highlightId: id, content })
						}
					}}
					className={cn(styleBarItemStyle, {
						[styleBarItemActiveStyle]: editor.isActive('highlight'),
					})}
				>
					<MessageCircleIcon className="h-4 w-4" />
				</div>
			</Tooltip>
			{hiddenButtons.length > 0 && (
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
						{hiddenButtons.map(({ icon, label, command, params, activeId }) => (
							<DropdownMenuItem
								key={label}
								onClick={e => {
									e.preventDefault()
									e.stopPropagation()
									// @ts-ignore
									editor.chain().focus()[command](params).run()
								}}
								className={cn(styleBarItemStyle, 'flex items-center gap-3', {
									[styleBarItemActiveStyle]: editor.isActive(
										activeId ?? camelCase(label ?? ''),
										params,
									),
								})}
							>
								<span>{icon ?? label}</span>
								<span>{label}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	)
}

const extensions = [
	LineHeight,
	Color.configure({ types: [TextStyle.name, ListItem.name] }),
	// @ts-ignore
	TextStyle.configure({ types: [ListItem.name] }),
	StarterKit.configure({
		bulletList: { keepMarks: true, keepAttributes: false },
		orderedList: { keepMarks: true, keepAttributes: false },
	}),
	Highlight.extend({
		addAttributes() {
			return {
				id: { default: null, renderHTML: ({ id }) => ({ id }) },
				class: {
					default: null,
					renderHTML: ({ class: cn }) => ({ class: cn }),
				},
			}
		},
	}),
]

export const TiptapEditor = ({
	initialContent = '<h1></h1>',
	onChange,
	onHighlight,
}: {
	initialContent?: string | null
	onChange?: ({ html, text }: { html: string; text: string }) => void
	onHighlight?: onHighlight
}) => {
	const [text, setText] = useState<string>()
	const [html, setHtml] = useState<string>()
	const [debouncedText] = useDebounce(text, 1000)
	const [debouncedHtml] = useDebounce(html, 1000)

	useEffect(() => {
		if (initialContent === debouncedHtml) {
			return
		}

		onChange?.({ html: debouncedHtml ?? '', text: debouncedText ?? '' })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedHtml, debouncedText])

	useEffect(() => {
		document.onclick = e => {
			const mark = (e.target as HTMLDivElement).closest('mark')
			const commentId = mark?.getAttribute('id')

			if (commentId) {
				const element = document.getElementById(`${commentId}-comment`)

				if (!element) return

				mark?.classList.add('focused')
				element.scrollIntoView({ behavior: 'smooth' })
				element.click()
			}
		}

		return () => {
			document.onclick = null
		}
	})

	return (
		<EditorProvider
			extensions={extensions}
			content={initialContent}
			slotBefore={<StyleBar onHighlight={onHighlight} />}
			children={undefined}
			onUpdate={({ editor }) => {
				setText(editor.getText())
				setHtml(editor.getHTML())
			}}
		/>
	)
}
