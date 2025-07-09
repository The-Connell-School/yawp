import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import { Bar } from './bar';
import { ErrorBoundary } from './error-boundry';
import { Comment, CommentExtension } from './extensions/comment';
import { LineHeight } from './extensions/line-height';
import { OperationTracker } from './operation-tracker';
import { HistoryManager } from './history-manager';

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
];

type Props = {
  docId: string;
  docHtml: string | null;
  setIsSaving: (isSaving: boolean) => void;
};

export const Editor = ({ docId, docHtml, setIsSaving }: Props) => {
  const editor = useEditor({
    extensions,
    content: docHtml,
    immediatelyRender: false,
  });
  const operationTracker = useRef<OperationTracker | null>(null);
  const historyManager = useRef<HistoryManager | null>(null);

  useEffect(() => {
    if (!editor) return;

    // Initialize history manager
    historyManager.current = new HistoryManager(docId);

    // Initialize operation tracker with refresh callback
    operationTracker.current = new OperationTracker(docId, () => {
      // Refresh history when operations are flushed
      if (historyManager.current) {
        historyManager.current.refreshOperations();
      }
    });

    const saveToBackend = debounce(async () => {
      setIsSaving(true);
      const html = editor.getHTML();
      const text = editor.getText();
      const formData = new FormData();
      formData.append('html', html);
      formData.append('text', text);
      await fetch(`/api/model/document/${docId}`, {
        method: 'PUT',
        body: formData,
      });
      setIsSaving(false);
    }, 1000);

    const handleUpdate = ({
      editor,
      transaction,
    }: {
      editor: any;
      transaction: any;
    }) => {
      // Track individual operations
      if (operationTracker.current) {
        operationTracker.current.trackTransaction(transaction);
      }

      // Keep existing debounced save
      saveToBackend();
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
      if (operationTracker.current) {
        operationTracker.current.destroy();
      }
      if (historyManager.current) {
        historyManager.current.destroy();
      }
    };
  }, [editor, docId, setIsSaving]);

  return (
    <ErrorBoundary>
      <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
        <Bar
          editor={editor}
          documentId={docId}
          operationTracker={operationTracker.current}
          historyManager={historyManager.current}
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
  );
};
