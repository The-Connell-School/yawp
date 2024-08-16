import { type Document } from '@prisma/client'
import { useBeforeUnload, useNavigation } from '@remix-run/react';
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect } from 'react'
import { useLocalStorage } from 'usehooks-ts';
import { Bar } from './bar'
import { Comment, CommentExtension } from './extensions/comment'
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
	Comment,
	CommentExtension,
]

type Props = {
	doc: JsonifyObject<Omit<Document, 'createdAt' | 'deletedAt' | 'updatedAt' | 'userId'>>
	setIsSaving: (isSaving: boolean) => void
}

export const Editor = ({ doc, setIsSaving }: Props) => {
	const [stored, setStored] = useLocalStorage<{ html: string; text: string } | null>(`document-${doc.id}`, null)
	const editor = useEditor({ extensions, content: stored?.html ?? doc.html })
	const navigation = useNavigation();

	// Save to local storage on every keystroke
	useEffect(() => {
		if (!editor) return;

		const saveToLocalStorage = () => {
			const html = editor.getHTML();
			const text = editor.getText();
			setStored({ html, text })
		};

		editor.on('update', saveToLocalStorage);
		return () => {
			editor.off('update', saveToLocalStorage);
		};
	}, [editor, doc.id, setIsSaving, stored, setStored]);

	const saveToBackend = useCallback(async () => {
		setIsSaving(true);
		if (stored) {
			const { html, text } = stored;
			const formData = new FormData();
			formData.append('html', html);
			formData.append('text', text);
			await fetch(`/api/model/document/${doc.id}`, { method: 'PUT', body: formData });
		}
		setIsSaving(false);
	}, [doc.id, setIsSaving, stored]);

	// Save to backend on page refresh
	useBeforeUnload(saveToBackend);

	// Save to backend when remix is navigating away from this page
	useEffect(() => {
		if (navigation.state === 'loading') {
			saveToBackend();
		}
	}, [navigation.state, saveToBackend]);

	return (
		<div className="flex w-full flex-col overflow-hidden border-r md:h-full">
			<Bar editor={editor} documentId={doc.id} />
			<div className="no-scrollbar grow overflow-y-scroll p-5 font-times">
				<EditorContent
					editor={editor}
					className="h-full pb-5 [&>div]:h-full [&>div]:outline-none"
				/>
			</div>
		</div>
	)
}
