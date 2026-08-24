import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import {
  CollabHttpProvider,
  type CollabStatus,
} from '~/domain/collaboration/http-provider';
import {
  COLLAB_META_MAP,
  COLLAB_SCHEMA_VERSION,
  COLLAB_SCHEMA_VERSION_KEY,
  collaborativeSchemaExtensions,
} from '~/domain/collaboration/schema';
// Imported from the existing editor, never modified there. Reusing the toolbar is
// what makes this page look like the solo editor; duplicating it would let the two
// drift apart.
import { Bar } from '../app_.documents_.$id/document-editor/editor-bar';
import { ErrorBoundary } from '../app_.documents_.$id/document-editor/error-boundry';

/**
 * The collaborative editor surface.
 *
 * Syncs through `CollabHttpProvider` — our own HTTP endpoints, not a hosted
 * provider. A collaborator's text arrives within about a second; the writer's own
 * typing is instant, because TipTap applies local edits before the provider is
 * involved.
 *
 * The document schema lives in `~/domain/collaboration/schema.ts` and is shared
 * with the server-side snapshot conversion, so the HTML written into Postgres for
 * grading is generated from exactly the schema the editor wrote with.
 *
 * Named collaborator carets are drawn from Yjs awareness, which the provider
 * carries alongside the document: a teammate's cursor and selection appear where
 * they are working, labelled with their name in the same colour their initials
 * have in the header and their sentences have on the teacher's page.
 *
 * A caret is not document state, and the transport keeps them apart on purpose —
 * a cursor never enters the room's update log, so it is never replayed to a
 * future reader or folded into the snapshot the teacher grades.
 */

type Props = {
  docId: string;
  /** False for a teacher: they follow the draft and comment, never write in it. */
  canWrite: boolean;
  /**
   * Whose caret this is. Sent as a courtesy — the server overwrites it with the
   * identity it resolved from the session before any teammate sees it, so a
   * browser cannot label its cursor with a classmate's name. It is passed at all
   * so this writer's own view is consistent from the first keystroke rather than
   * after the first round trip.
   */
  user: { name: string; color: string };
};

export function CollabEditor({ docId, canWrite, user }: Props) {
  const [status, setStatus] = useState<CollabStatus>({ kind: 'connecting' });
  const [staleSchema, setStaleSchema] = useState(false);

  // One Y.Doc per document for the life of this component. Recreating it would
  // discard the room and re-download it.
  const ydoc = useMemo(() => new Y.Doc(), [docId]);

  // The provider is constructed by the effect and published to the render through
  // state, rather than built in a memo where the extension list could reach it
  // directly. The memo is the obvious shape and it is wrong: React StrictMode
  // renders twice and runs every effect setup → cleanup → setup, so a memoized
  // provider is destroyed and then handed back to the second setup. It reported
  // "connecting" forever, because `start` on a destroyed provider does nothing —
  // and the discarded second render leaked a provider nobody would ever destroy.
  //
  // The cost is that the editor is built once without carets and once with them.
  // That is cheap here: with Collaboration the Y.Doc holds the content, so
  // rebuilding the editor loses nothing.
  const [provider, setProvider] = useState<CollabHttpProvider | null>(null);

  useEffect(() => {
    const started = new CollabHttpProvider({
      documentId: docId,
      ydoc,
      canWrite,
      onStatusChange: setStatus,
    });
    setProvider(started);

    void started.start().then(() => {
      // Schema-version handshake, once the room has loaded. A room written by a
      // newer client must not be edited by this one: it would silently drop the
      // nodes it cannot represent, damaging everyone's draft rather than just its
      // own view.
      const meta = ydoc.getMap<number>(COLLAB_META_MAP);
      const roomVersion = meta.get(COLLAB_SCHEMA_VERSION_KEY);

      if (typeof roomVersion === 'number' && roomVersion > COLLAB_SCHEMA_VERSION) {
        setStaleSchema(true);
        return;
      }
      if (roomVersion === undefined && canWrite) {
        meta.set(COLLAB_SCHEMA_VERSION_KEY, COLLAB_SCHEMA_VERSION);
      }
    });

    return () => {
      // Send anything still queued before tearing down, so closing the tab mid
      // sentence does not lose it. `destroy` also says goodbye, which takes this
      // writer's caret off their teammates' screens at once.
      void started.flush().finally(() => started.destroy());
    };
  }, [docId, ydoc, canWrite]);

  const extensions = useMemo(
    () => [
      ...collaborativeSchemaExtensions,
      Collaboration.configure({ document: ydoc }),
      // Only once the provider exists: the extension throws without one, and it
      // reads carets straight off `provider.awareness`.
      ...(provider
        ? [
            CollaborationCursor.configure({
              provider,
              user: { name: user.name, color: user.color },
            }),
          ]
        : []),
    ],
    [ydoc, provider, user.name, user.color]
  );

  const editable = canWrite && status.kind === 'live' && !staleSchema;

  const editor = useEditor(
    {
      extensions,
      // NO `content`, and this is not an omission. With Collaboration the Y.Doc is
      // the source of truth; passing initial content makes every client insert its
      // own copy, so the document duplicates once per participant. Seeding an
      // existing document happens once, server-side, into a confirmed-empty room.
      immediatelyRender: false,
      editable,
      editorProps: {
        attributes: { 'aria-label': 'Shared group document editor' },
      },
    },
    // Rebuilt when the provider arrives, which is what puts the carets in.
    [ydoc, provider]
  );

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const focusEditorFromPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!editor || !editable) return;
      const pm = editor.view.dom as HTMLElement;
      if (pm.contains(event.target as Node)) return;
      event.preventDefault();
      editor.chain().focus('end').run();
    },
    [editor, editable]
  );

  return (
    <ErrorBoundary>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:h-full">
        {staleSchema ? (
          <div
            role="alert"
            className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900"
          >
            This draft was opened with a newer version of the editor. Reload the
            page to get the latest version — until then it is read-only, so nothing
            your group wrote can be lost.
          </div>
        ) : null}

        {status.kind === 'error' ? (
          <div
            role="alert"
            className="border-b bg-red-50 px-4 py-2 text-sm text-red-800"
          >
            {status.message}
          </div>
        ) : null}

        {status.kind === 'connecting' ? (
          <div
            role="status"
            aria-live="polite"
            className="border-b px-4 py-2 text-sm text-gray-600"
          >
            Opening your group's draft…
          </div>
        ) : null}

        {editable && editor ? (
          <Bar editor={editor} documentId={docId} isEditable={editable} />
        ) : null}

        <div
          className="no-scrollbar grow overflow-y-scroll p-5"
          data-testid="collab-editor-scroll"
          key={`${docId}-collab-editor`}
          onMouseDown={focusEditorFromPaneClick}
        >
          <div
            className="mx-auto w-full min-h-full max-w-[920px] cursor-text font-times"
            data-testid="collab-editor-surface"
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
