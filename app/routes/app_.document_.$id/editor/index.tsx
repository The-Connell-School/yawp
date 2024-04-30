import { type Document } from '@prisma/client'
import { useFetcher } from '@remix-run/react'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style'
import { EditorProvider } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState, useEffect } from 'react'
import { useDebounce } from '#app/hooks/useDebounce'
import { Bar, type BarProps } from './bar'
import { LineHeight } from './extensions/line-height'

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

type Props = { document: JsonifyObject<Document> }

export const Editor = ({ document: { html: initialHtml, id } }: Props) => {
	const updateDocumentFetcher = useFetcher({ key: 'update-document' })
	const createDocumentCommentFetcher = useFetcher({
		key: 'create-document-comment',
	})

	const [text, setText] = useState<string>()
	const [html, setHtml] = useState<string>()
	const debounce = 800
	const [debouncedText] = useDebounce(text, debounce)
	const [debouncedHtml] = useDebounce(html, debounce)

	const handleHighlight: BarProps['onHighlight'] = ({
		highlightId,
		content,
	}) => {
		createDocumentCommentFetcher.submit(
			{ highlightId, content, documentId: id },
			{ method: 'POST', action: '/api/model/document-comment' },
		)

		setTimeout(() => {
			const comment = document.getElementById(highlightId)
			comment?.click()
		}, 50)
	}

	useEffect(() => {
		if (!debouncedHtml) {
			return
		}

		updateDocumentFetcher.submit(
			{ html: debouncedHtml ?? '', text: debouncedText ?? '' },
			{ method: 'PUT', action: `/api/model/document/${id}` },
		)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedHtml, debouncedText])

	useEffect(() => {
		document.onclick = e => {
			const mark = (e.target as HTMLDivElement).closest('mark')
			const highlightId = mark?.getAttribute('id')

			if (highlightId) {
				const comment = document.getElementById(`${highlightId}-comment`)
				if (!comment) return

				mark?.classList.add('focused')
				comment.scrollIntoView({ behavior: 'smooth' })
				comment.click()
			}
		}

		return () => {
			document.onclick = null
		}
	})

	return (
		<div className="w-full overflow-hidden border-r font-times md:h-full [&>div:nth-child(2)>div]:h-[calc(100vh-133px)] [&>div:nth-child(2)>div]:overflow-scroll [&>div:nth-child(2)>div]:p-5 focus-visible:[&>div:nth-child(2)>div]:outline-none md:[&>div:nth-child(2)>div]:h-[calc(100vh-93px)]">
			<EditorProvider
				extensions={extensions}
				content={initialHtml}
				slotBefore={<Bar onHighlight={handleHighlight} />}
				children={undefined}
				onUpdate={({ editor }) => {
					setText(editor.getText())
					setHtml(editor.getHTML())
				}}
			/>
		</div>
	)
}
