import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect } from 'react';
import { useCommentsSelection } from '../comments/selection-context';
import { Bar } from './editor-bar';
import { ErrorBoundary } from './error-boundry';
import { Comment, CommentExtension } from './extensions/comment';
import { LineHeight } from './extensions/line-height';
import { TabIndent } from './extensions/tab-indent';
import { SourceTracker } from './extensions/source-tracker';
import { usePmTripwire } from './use-pm-tripwire';
import { useEditorSync, type EditorBridge } from './use-editor-sync';
import { usePasteAlert } from './use-paste-alert';
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
  onSubmittableContentChange?: (submittable: boolean) => void;
  onEditorDomReady?: (root: HTMLElement | null) => void;
  onCommentCreated?: (comment: unknown) => void;
};

export function Editor({
  docId,
  initialHtml,
  initialRevision,
  isEditable,
  onBridgeReady,
  onSyncStatusChange,
  onSubmittableContentChange,
  onEditorDomReady,
  onCommentCreated,
}: Props) {
  const editor = useEditor({
    extensions,
    content: initialHtml,
    immediatelyRender: false,
    editable: isEditable,
    editorProps: {
      attributes: {
        'aria-label': 'Student document editor',
      },
    },
  });

  // Reflect prop changes to the editor's editable state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditable);
  }, [editor, isEditable]);

  // Expose editor for E2E test helpers (flush domObserver after typing)
  useEffect(() => {
    if (editor) (window as any).__yawpEditor = editor;
    return () => { delete (window as any).__yawpEditor; };
  }, [editor]);

  // Install the runtime tripwire (catches unauthorized PM mutations)
  usePmTripwire(editor);

  // Detect large pastes from external sources
  usePasteAlert(editor, docId);

  // Wire up PM ↔ IDB ↔ server persistence + 5-min revision timer
  useEditorSync(editor, {
    docId,
    initialRevision,
    onBridgeReady,
    onSyncStatusChange,
    onSubmittableContentChange,
  });

  // Expose editor DOM root to siblings (used by teacher grade-highlights overlay)
  useEffect(() => {
    if (!editor || !onEditorDomReady) return;
    onEditorDomReady(editor.view.dom as HTMLElement);
    return () => onEditorDomReady(null);
  }, [editor, onEditorDomReady]);

  // Comment mark hover/active state (student-side comments — preserved from old editor)
  const {
    activeCommentId,
    setActiveCommentId,
    hoveredCommentId,
    setHoveredCommentId,
  } = useCommentsSelection();

  // Route custom events dispatched by the comment ProseMirror extension
  // into the shared selection state (mark click / hover → state).
  useEffect(() => {
    const onActive = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      if (typeof id === 'string') setActiveCommentId(id);
    };
    const onHover = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      if (typeof id === 'string') setHoveredCommentId(id);
    };
    const onUnhover = () => setHoveredCommentId(null);
    window.addEventListener('document-comment-active', onActive);
    window.addEventListener('document-comment-hover', onHover);
    window.addEventListener('document-comment-unhover', onUnhover);
    return () => {
      window.removeEventListener('document-comment-active', onActive);
      window.removeEventListener('document-comment-hover', onHover);
      window.removeEventListener('document-comment-unhover', onUnhover);
    };
  }, [setActiveCommentId, setHoveredCommentId]);

  // Scroll the active mark into view when selection changes.
  useEffect(() => {
    if (!activeCommentId) return;
    const first = document.querySelector<HTMLElement>(
      `[data-comment-id="${activeCommentId}"]`
    );
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeCommentId]);

  const focusEditorFromPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (!editor || !isEditable) return;
      const pm = editor.view.dom as HTMLElement;
      if (pm.contains(e.target as Node)) return;
      e.preventDefault();
      editor.chain().focus('end').run();
    },
    [editor, isEditable],
  );

  // Bolden styles for the active/hovered comment marks. Rendered as a
  // <style> tag (not classList toggling) because ProseMirror re-renders
  // its mark spans from the schema and overwrites any class we add
  // imperatively. data-comment-id attributes survive PM re-renders.
  const focusedCommentIds = Array.from(
    new Set([activeCommentId, hoveredCommentId].filter(Boolean) as string[])
  );

  return (
    <ErrorBoundary>
      {focusedCommentIds.length > 0 ? (
        <style>
          {focusedCommentIds
            .map(
              (id) =>
                `.comment-mark[data-comment-id="${CSS.escape(id)}"] {` +
                ` background-color: #fde047;` +
                ` border-bottom: 2px solid #ca8a04;` +
                ` box-shadow: 0 2px 6px -1px rgba(202, 138, 4, 0.35);` +
                ` }`
            )
            .join('\n')}
        </style>
      ) : null}
      <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
        {isEditable && editor ? (
          <Bar
            editor={editor}
            documentId={docId}
            isEditable={isEditable}
            onCommentCreated={onCommentCreated}
          />
        ) : null}
        <div
          className="no-scrollbar grow overflow-y-scroll p-5"
          data-testid="document-editor-scroll"
          key={`${docId}-editor`}
          onMouseDown={focusEditorFromPaneClick}
        >
          <div
            className="mx-auto w-full min-h-full max-w-[920px] cursor-text font-times"
            data-testid="document-editor-surface"
          >
            <EditorContent
              editor={editor}
              className="h-full pb-5 [&>div]:h-full [&>div]:outline-none [&_.ProseMirror]:min-h-full"
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
