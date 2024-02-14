import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style'
import {
	EditorProvider,
	useCurrentEditor,
	type ChainedCommands,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
	BoldIcon,
	Code2Icon,
	CodeIcon,
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
import { useState, type ReactNode, useEffect } from 'react'
import { v4 } from 'uuid'
import { DividerHorizontalIcon, ListBulletIcon } from '#app/components/icons'
import { Tooltip } from '#app/components/ui/tooltip'
import { useDebounce } from '#app/hooks/useDebounce'
import { camelCase } from '#app/utils/camelCase'
import { cn } from '#app/utils/misc'

const styleButtons: {
	icon?: ReactNode
	label: string
	command: keyof ChainedCommands
	params?: any
	checkDisabled?: boolean
	disableActiveStyles?: boolean
	activeId?: string
}[] = [
	{
		icon: <BoldIcon className="h-4" />,
		label: 'Bold',
		command: 'toggleBold',
		checkDisabled: true,
	},
	{
		icon: <ItalicIcon className="h-4" />,
		label: 'Italic',
		command: 'toggleItalic',
		checkDisabled: true,
	},
	{
		icon: <StrikethroughIcon className="h-4" />,
		label: 'Strike',
		command: 'toggleStrike',
		checkDisabled: true,
	},
	{
		icon: <CodeIcon className="h-4" />,
		label: 'Code',
		command: 'toggleCode',
	},
	{
		icon: <Trash className="h-4" />,
		label: 'Clear marks',
		command: 'unsetAllMarks',
		disableActiveStyles: true,
	},
	{
		icon: <p className="px-2 text-xs">P</p>,
		label: 'Paragraph',
		command: 'setParagraph',
	},
	{
		label: 'H1',
		icon: <Heading1Icon className="h-4" />,
		command: 'toggleHeading',
		activeId: 'heading',
		params: { level: 1 },
	},
	{
		label: 'H2',
		icon: <Heading2Icon className="h-4" />,
		command: 'toggleHeading',
		activeId: 'heading',
		params: { level: 2 },
	},
	{
		label: 'H3',
		icon: <Heading3Icon className="h-4" />,
		command: 'toggleHeading',
		activeId: 'heading',
		params: { level: 3 },
	},
	{
		icon: <ListBulletIcon className="h-4" />,
		label: 'Bullet list',
		command: 'toggleBulletList',
	},
	{
		icon: <ListOrderedIcon className="h-4" />,
		label: 'Ordered list',
		command: 'toggleOrderedList',
	},
	{
		icon: <Code2Icon className="h-4" />,
		label: 'Code block',
		command: 'toggleCodeBlock',
	},
	{
		icon: <QuoteIcon className="h-4" />,
		label: 'Blockquote',
		command: 'toggleBlockquote',
	},
	{
		icon: <DividerHorizontalIcon className="h-4" />,
		label: 'Horizontal rule',
		command: 'setHorizontalRule',
		disableActiveStyles: true,
	},
	{
		icon: <Undo2Icon className="h-4" />,
		label: 'Undo',
		command: 'undo',
	},
	{
		icon: <Redo2Icon className="h-4" />,
		label: 'Redo',
		command: 'redo',
	},
]

const styleBarItemStyle: HTMLDivElement['className'] =
	'p-2 hover:bg-foreground/10 cursor-pointer rounded-sm transition-colors'
const styleBarItemActiveStyle: HTMLDivElement['className'] =
	'bg-background shadow hover:bg-background'

const StyleBar = () => {
	const { editor } = useCurrentEditor()

	if (!editor) {
		return null
	}

	return (
		<div className="mx-auto mb-8 flex w-fit items-center gap-1 rounded bg-foreground/5 p-1 shadow dark:bg-foreground/15">
			{styleButtons.map(({ icon, label, command, params, activeId }) => (
				<Tooltip text={label} delayDuration={300} key={label}>
					<div
						// @ts-ignore
						onClick={() => editor.chain().focus()[command](params).run()}
						className={cn(styleBarItemStyle, {
							[styleBarItemActiveStyle]: editor.isActive(
								activeId ?? camelCase(label),
								params,
							),
						})}
					>
						{icon ?? label}
					</div>
				</Tooltip>
			))}
			<Tooltip text="Comment" delayDuration={300}>
				<div
					onClick={() => {
						editor.chain().focus().toggleHighlight().run()
						editor.commands.updateAttributes('highlight', { id: v4() })
					}}
					className={cn(styleBarItemStyle, {
						[styleBarItemActiveStyle]: editor.isActive('highlight'),
					})}
				>
					<MessageCircleIcon className="h-4" />
				</div>
			</Tooltip>
		</div>
	)
}

const extensions = [
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

export const Editor = ({
	initialContent = '<h1></h1>',
	onChange,
}: {
	initialContent?: string | null
	onChange?: ({ html, text }: { html: string; text: string }) => void
}) => {
	const [text, setText] = useState<string>()
	const [html, setHtml] = useState<string>()
	const [debouncedText] = useDebounce(text, 1000)
	const [debouncedHtml] = useDebounce(html, 1000)

	useEffect(() => {
		if (initialContent === debouncedHtml) {
			return
		}

		if (debouncedHtml && debouncedText) {
			onChange?.({ html: debouncedHtml, text: debouncedText })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedHtml, debouncedText])

	return (
		<EditorProvider
			extensions={extensions}
			content={initialContent}
			slotBefore={<StyleBar />}
			children={undefined}
			onUpdate={({ editor }) => {
				setText(editor.getText())
				setHtml(editor.getHTML())
			}}
		/>
	)
}
