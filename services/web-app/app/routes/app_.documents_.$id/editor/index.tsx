import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import { useCommentsSelection } from '../comments/selection-context';
import { Bar } from './bar';
import { ErrorBoundary } from './error-boundry';
import { Comment, CommentExtension } from './extensions/comment';
import { EssayHighlight, EssayHighlightExtension } from './extensions/essay-highlight';
import { LineHeight } from './extensions/line-height';

const debounce = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

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
      };
    },
  }),
  Comment,
  CommentExtension,
  EssayHighlight,
  EssayHighlightExtension,
];

type Props = {
  docId: string;
  docHtml: string | null;
  setIsSaving: (isSaving: boolean) => void;
};

export const Editor = ({ docId, docHtml, setIsSaving }: Props) => {
  const {
    activeCommentId,
    hoveredCommentId,
    setActiveCommentId,
    setHoveredCommentId,
  } = useCommentsSelection();
  const editor = useEditor({
    extensions,
    content: docHtml,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;

    const save = async () => {
      setIsSaving(true);
      const html = editor.getHTML();
      const text = editor.getText();
      const formData = new FormData();
      formData.append('html', html);
      formData.append('text', text);
      await fetch(`/api/model/document/${docId}?from=editor`, {
        method: 'PUT',
        body: formData,
        keepalive: true,
      });
      setIsSaving(false);
    };

    const saveDebounced = debounce(save, 1500);

    editor.on('update', saveDebounced);
    editor.on('blur', save);

    return () => {
      editor.off('update', saveDebounced);
      editor.off('blur', save);
    };
  }, [editor, docId, setIsSaving]);

  useEffect(() => {
    if (!editor) return;

    // Track if content was copied from tutor messages
    const handleCopy = (event: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // Check if the selection contains or is within a tutor message element
      const tutorMessageElement = (
        container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : (container as Element)
      )?.closest('[data-tutor-message="true"]');

      if (tutorMessageElement) {
        // Store flag that content was copied from tutor message
        sessionStorage.setItem(`tutor-copy-${docId}`, 'true');
        // Clear flag after 5 seconds to prevent stale flags
        setTimeout(() => {
          sessionStorage.removeItem(`tutor-copy-${docId}`);
        }, 5000);
      }
    };

    const handlePaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const textLength = pastedText.length;

      // Only detect large pastes if they came from tutor messages
      const copiedFromTutor =
        sessionStorage.getItem(`tutor-copy-${docId}`) === 'true';

      if (textLength >= 200 && copiedFromTutor) {
        // Clear the flag after using it
        sessionStorage.removeItem(`tutor-copy-${docId}`);

        // Send paste alert to API asynchronously
        fetch('/api/paste-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: docId,
            textLength,
            content: pastedText,
          }),
        }).catch((err) => {
          console.error('Failed to log paste alert:', err);
        });
      }
    };

    // Listen for copy events on the entire document to catch copies from tutor messages
    document.addEventListener('copy', handleCopy);
    editor.view.dom.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('copy', handleCopy);
      editor.view.dom.removeEventListener('paste', handlePaste);
    };
  }, [editor, docId]);

  useEffect(() => {
    if (!editor) return;
    // Toggle classes on marks to reflect hovered/active state from context
    const allMarks = document.querySelectorAll<HTMLElement>('.comment-mark');
    allMarks.forEach((el) => el.classList.remove('focused'));
    if (hoveredCommentId) {
      document
        .querySelectorAll<HTMLElement>(
          `[data-comment-id="${hoveredCommentId}"]`
        )
        .forEach((el) => el.classList.add('focused'));
    }
    if (activeCommentId) {
      document
        .querySelectorAll<HTMLElement>(`[data-comment-id="${activeCommentId}"]`)
        .forEach((el) => el.classList.add('focused'));
    }
  }, [editor, activeCommentId, hoveredCommentId]);

  useEffect(() => {
    // Bridge TipTap plugin custom events to context
    const onHover = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id) setHoveredCommentId(id);
    };
    const onUnhover = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id && hoveredCommentId === id) setHoveredCommentId(null);
    };
    const onActive = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id) setActiveCommentId(id);
    };
    window.addEventListener('document-comment-hover', onHover as any);
    window.addEventListener('document-comment-unhover', onUnhover as any);
    window.addEventListener('document-comment-active', onActive as any);
    return () => {
      window.removeEventListener('document-comment-hover', onHover as any);
      window.removeEventListener('document-comment-unhover', onUnhover as any);
      window.removeEventListener('document-comment-active', onActive as any);
    };
  }, [hoveredCommentId, setHoveredCommentId, setActiveCommentId]);

  return (
    <ErrorBoundary>
      <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
        <Bar editor={editor} documentId={docId} />
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
  );
};
