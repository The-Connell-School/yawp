import { type Document } from '@prisma/client'
import { useFetcher } from '@remix-run/react'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'
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

type Props = {
	doc: JsonifyObject<Omit<Document, 'createdAt' | 'deletedAt' | 'updatedAt' | 'userId'>>
	setIsSaving: (isSaving: boolean) => void
}

export const Editor = ({ doc, setIsSaving }: Props) => {
	const createDocumentCommentFetcher = useFetcher<{ highlightId: string }>({
		key: 'create-document-comment',
	})

	const editor = useEditor({ extensions, content: doc.html })
	const debounce = 800
	const [debouncedText] = useDebounce(editor?.getText(), debounce)
	const [debouncedHtml] = useDebounce(editor?.getHTML(), debounce)

	const createComment: BarProps['onHighlight'] = ({ highlightId, content }) => {
		createDocumentCommentFetcher.submit(
			{ highlightId, content, documentId: doc.id },
			{ method: 'POST', action: '/api/model/document-comment' },
		)
	}

	useEffect(() => {
		if (createDocumentCommentFetcher.data) {
			const highlightId = createDocumentCommentFetcher.data.highlightId
			// setTimeout(() => {
			// 	const comment = document.getElementById(`${highlightId}-comment`)
			// 	comment?.click()
			// }, 200)
		}
	}, [createDocumentCommentFetcher.data])

	useEffect(() => {
		if (doc.html !== editor?.getHTML()) {
			editor?.commands.setContent(doc.html)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [doc.html])

	useEffect(() => {
		if (!debouncedHtml) {
			return
		}

		setIsSaving(true)
		const formData = new FormData()
		formData.append('html', debouncedHtml ?? '')
		formData.append('text', debouncedText ?? '')
		fetch(`/api/model/document/${doc.id}`, {
			method: 'PUT',
			body: formData,
		}).then(() => setIsSaving(false))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedHtml, debouncedText])

	useEffect(() => {
		const marks = document.querySelectorAll('mark')

		const handleClick = (e: MouseEvent) => {
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

		marks.forEach(mark => {
			mark.addEventListener('click', handleClick)
		})

		return () => {
			marks.forEach(mark => {
				mark.removeEventListener('click', handleClick)
			})
		}
	})

	return (
		<div className="flex w-full flex-col overflow-hidden border-r md:h-full">
			<Bar onHighlight={createComment} editor={editor} />
			<div className="no-scrollbar grow overflow-y-scroll p-5 font-times">
				<EditorContent
					editor={editor}
					className="h-full pb-5 [&>div]:h-full [&>div]:outline-none"
				/>
			</div>
		</div>
	)
}
