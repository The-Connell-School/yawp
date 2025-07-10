import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { Bar } from './bar'
import { ErrorBoundary } from './error-boundry'
import { Comment, CommentExtension } from './extensions/comment'
import { LineHeight } from './extensions/line-height'
import { useDocumentOperations } from '~/hooks/useDocumentOperations'
import { DocumentOperationService } from '~/services/documentOperations'

const debounce = (func: Function, delay: number) => {
	let timeoutId: NodeJS.Timeout
	return (...args: any[]) => {
		clearTimeout(timeoutId)
		timeoutId = setTimeout(() => func(...args), delay)
	}
}

const extensions = [
	LineHeight,
	Color.configure({ types: [TextStyle.name, ListItem.name] }),
	// @ts-ignore
	TextStyle.configure({ types: [ListItem.name] }),
	StarterKit.configure({
		bulletList: { keepMarks: true, keepAttributes: false },
		orderedList: { keepMarks: true, keepAttributes: false },
		history: false, // Disable default undo/redo
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
	Comment,
	CommentExtension,
]

type Props = {
	docId: string
	docHtml: string | null
	setIsSaving: (isSaving: boolean) => void
}

export const Editor = ({ docId, docHtml, setIsSaving }: Props) => {
	const editor = useEditor({ extensions, content: docHtml })
	const operationService = useRef<DocumentOperationService | null>(null)
	const operations = useDocumentOperations(docId)

	// Initialize operation service
	useEffect(() => {
		if (!editor) return

		operationService.current = new DocumentOperationService(
			editor,
			(operation) => {
				// Convert operation to database format and save
				operations.createOperation({
					documentId: docId,
					operationType: operation.type,
					position: operation.position,
					content: operation.content,
					metadata: JSON.stringify(operation.metadata),
					stackPosition: 0, // This will be set by the hook
				})
			}
		)
	}, [editor, docId, operations])

	// Track editor transactions for operations
	useEffect(() => {
		if (!editor || !operationService.current) return

		const handleTransaction = (transaction: any) => {
			// Skip if transaction is from our own undo/redo operations
			if (transaction.getMeta('isUndoRedo')) return

			// Process the transaction to extract operations
			const processedOperations = operationService.current!.processTransaction(transaction)
			
			// Create database entries for each operation
			processedOperations.forEach((operation) => {
				operations.createOperation({
					documentId: docId,
					operationType: operation.type,
					position: operation.position,
					content: operation.content,
					metadata: JSON.stringify(operation.metadata),
					stackPosition: 0, // This will be set by the hook
				})
			})
		}

		editor.on('transaction', handleTransaction)
		return () => {
			editor.off('transaction', handleTransaction)
		}
	}, [editor, docId, operations])

	// Traditional document saving (keep existing functionality)
	useEffect(() => {
		if (!editor) return

		const saveToBackend = debounce(async () => {
			setIsSaving(true)
			const html = editor.getHTML()
			const text = editor.getText()
			const formData = new FormData()
			formData.append('html', html)
			formData.append('text', text)
			await fetch(`/api/model/document/${docId}`, {
				method: 'PUT',
				body: formData,
			})
			setIsSaving(false)
		}, 1000)

		editor.on('update', saveToBackend)
		return () => {
			editor.off('update', saveToBackend)
		}
	}, [editor, docId, setIsSaving])

	return (
		<ErrorBoundary>
			<div className="flex w-full flex-col overflow-hidden border-r md:h-full">
				<Bar 
					editor={editor} 
					documentId={docId} 
					operations={operations}
					operationService={operationService.current}
				/>
				<div
					className="no-scrollbar grow overflow-y-scroll p-5 font-times"
					key={`${docId}-editor`}
				>
					<EditorContent
						editor={editor}
						className="h-full pb-5 [&>div]:h-full [&>div]:outline-none"
					/>
				</div>
			</div>
		</ErrorBoundary>
	)
}
