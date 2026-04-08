import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import { useCommentsSelection } from '../comments/selection-context';
import { Bar } from './editor-bar';
import { ErrorBoundary } from '../editor/error-boundry';
import { Comment, CommentExtension } from './extensions/comment';
import { LineHeight } from './extensions/line-height';
import { TabIndent } from './extensions/tab-indent';
import { SourceTracker } from './extensions/source-tracker';
import { usePmTripwire } from './use-pm-tripwire';
import { useEditorSync, type EditorBridge } from './use-editor-sync';
import type { SyncStatus } from '~/utils/sync-service';

const extensions = [
  TabIndent,
  LineHeight,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Color.configure({ types: [TextStyle.name, ListItem.name] }),
  // @ts-ignore — TextStyle's configure type is overly strict; this works at runtime
  TextStyle.configure({ types: [ListItem.name] }),
  StarterKit.configure({
    bulletList: { keepMarks: true, keepAttributes: false },
    orderedList: { keepMarks: true, keepAttributes: false },
  }),
  Highlight.extend({
    addAttributes() {
      return {
        id: { default: null, renderHTML: ({ id }: any) => ({ id }) },
        class: { default: null, renderHTML: ({ class: cn }: any) => ({ class: cn }) },
      };
    },
  }),
  Comment,
  CommentExtension,
  SourceTracker,
];

type Props = {
  docId: string;
  initialHtml: string;
  initialRevision: number;
  isEditable: boolean;
  onBridgeReady: (bridge: EditorBridge | null) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onEditorDomReady?: (root: HTMLElement | null) => void;
  onCommentCreated?: (comment: { id: string }) => void;
};

export function Editor({
  docId,
  initialHtml,
  initialRevision,
  isEditable,
  onBridgeReady,
  onSyncStatusChange,
  onEditorDomReady,
  onCommentCreated,
}: Props) {
  const editor = useEditor({
    extensions,
    content: initialHtml,
    immediatelyRender: false,
    editable: isEditable,
  });

  // Reflect prop changes to the editor's editable state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditable);
  }, [editor, isEditable]);

  // Install the runtime tripwire (catches unauthorized PM mutations)
  usePmTripwire(editor);

  // Wire up PM ↔ IDB ↔ server persistence + 5-min revision timer
  useEditorSync(editor, {
    docId,
    initialRevision,
    onBridgeReady,
    onSyncStatusChange,
  });

  // Expose editor DOM root to siblings (used by teacher grade-highlights overlay)
  useEffect(() => {
    if (!editor || !onEditorDomReady) return;
    onEditorDomReady(editor.view.dom as HTMLElement);
    return () => onEditorDomReady(null);
  }, [editor, onEditorDomReady]);

  // Comment mark hover/active state (student-side comments — preserved from old editor)
  const { activeCommentId, hoveredCommentId } = useCommentsSelection();
  useEffect(() => {
    if (!editor) return;
    const allMarks = document.querySelectorAll<HTMLElement>('.comment-mark');
    allMarks.forEach((el) => el.classList.remove('focused'));
    if (hoveredCommentId) {
      document
        .querySelectorAll<HTMLElement>(`[data-comment-id="${hoveredCommentId}"]`)
        .forEach((el) => el.classList.add('focused'));
    }
    if (activeCommentId) {
      document
        .querySelectorAll<HTMLElement>(`[data-comment-id="${activeCommentId}"]`)
        .forEach((el) => el.classList.add('focused'));
    }
  }, [editor, activeCommentId, hoveredCommentId]);

  return (
    <ErrorBoundary>
      <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
        {isEditable && editor ? (
          <Bar
            editor={editor}
            documentId={docId}
            isEditable={isEditable}
            onCommentCreated={onCommentCreated}
          />
        ) : null}
        <div className="no-scrollbar grow overflow-y-scroll p-5" key={`${docId}-editor`}>
          <div className="mx-auto w-full max-w-[920px] font-times">
            <EditorContent
              editor={editor}
              className="h-full pb-5 [&>div]:h-full [&>div]:outline-none"
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
