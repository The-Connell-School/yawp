import { HocuspocusProvider } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
// Imported from the existing editor, never modified there. Reusing the toolbar
// and the custom extensions is what makes this page look and behave like the
// solo editor; duplicating them would let the two drift apart.
import { Bar } from '../app_.documents_.$id/document-editor/editor-bar';
import { ErrorBoundary } from '../app_.documents_.$id/document-editor/error-boundry';
import { EmDash } from '../app_.documents_.$id/document-editor/extensions/em-dash';
import { LineHeight } from '../app_.documents_.$id/document-editor/extensions/line-height';
import { TabIndent } from '../app_.documents_.$id/document-editor/extensions/tab-indent';

/**
 * ⚠️ UNVERIFIED. This component has never been executed — no browser, no
 * database, and no collaboration provider were available when it was written.
 * Treat every line as a proposal. See the header of `route.tsx` for the full
 * list of what still has to be proven.
 */

/**
 * Bumped whenever the schema below gains or loses a node or mark.
 *
 * Rollout requirement: a client whose bundle knows fewer node types than the
 * room's content can silently drop what it cannot represent — and in a shared
 * document that damages everyone's draft, not just the stale client's. The room
 * records the highest schema version that has written to it; a client behind that
 * version joins read-only instead of quietly deleting a partner's work.
 */
export const COLLAB_SCHEMA_VERSION = 1;

const META_MAP = 'yawpMeta';
const SCHEMA_VERSION_KEY = 'schemaVersion';

/**
 * Deliberately NOT the solo editor's extension list, in three ways:
 *
 * 1. `history: false` — Collaboration replaces ProseMirror's undo stack with
 *    y-undo. Leaving both installed makes undo reach across collaborators and
 *    revert their edits.
 * 2. No `Comment`/`CommentExtension`/`SourceTracker`/`PastedSource`. Comments and
 *    paste alerts are anchored to solo-document behavior — paste detection in
 *    particular fires on copying from a partner's paragraph, which is normal here.
 *    They come back once they are collaborator-aware.
 * 3. Collaboration and CollaborationCursor are added per-instance below, because
 *    they close over the Y.Doc and provider.
 */
const baseExtensions = [
  TabIndent,
  LineHeight,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Color.configure({ types: [TextStyle.name, ListItem.name] }),
  // @ts-ignore — TextStyle's configure type is overly strict; this works at runtime
  TextStyle.configure({ types: [ListItem.name] }),
  StarterKit.configure({
    bulletList: { keepMarks: true, keepAttributes: false },
    orderedList: { keepMarks: true, keepAttributes: false },
    history: false,
  }),
  Highlight.extend({
    addAttributes() {
      return {
        id: { default: null, renderHTML: ({ id }: any) => ({ id }) },
        class: {
          default: null,
          renderHTML: ({ class: cn }: any) => ({ class: cn }),
        },
      };
    },
  }),
  EmDash,
];

/** Stable per-person cursor colors, matching the presence avatars. */
const CURSOR_COLORS = [
  '#1F4FD8',
  '#C2185B',
  '#0F8A6A',
  '#B4690E',
  '#6D28D9',
  '#0E7490',
  '#B91C1C',
  '#4D7C0F',
];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

type TokenResponse = {
  success: boolean;
  token?: string;
  documentName?: string;
  appId?: string;
  readOnly?: boolean;
  message?: string;
};

type Peer = { clientId: number; name: string; color: string };

type Props = {
  docId: string;
  /** Display name for this person's caret flag. */
  userName: string;
  membershipId: string;
  /** False for a teacher: they join to read, and never write student prose. */
  canWrite: boolean;
  onPeersChange?: (peers: Peer[]) => void;
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'connected' }
  | { kind: 'stale-schema' }
  | { kind: 'error'; message: string };

export function CollabEditor({
  docId,
  userName,
  membershipId,
  canWrite,
  onPeersChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [session, setSession] = useState<{
    ydoc: Y.Doc;
    provider: HocuspocusProvider;
  } | null>(null);

  // Keep the callback out of the connect effect's dependencies: it changes
  // identity on every parent render, and reconnecting the provider on each render
  // would thrash the room.
  const onPeersChangeRef = useRef(onPeersChange);
  useEffect(() => {
    onPeersChangeRef.current = onPeersChange;
  }, [onPeersChange]);

  useEffect(() => {
    let cancelled = false;
    let provider: HocuspocusProvider | null = null;
    let ydoc: Y.Doc | null = null;

    const connect = async () => {
      // The token is minted per document by our own server, which is where
      // authorization lives — the browser talks to the provider directly, so
      // this fetch is the only permission check in the path.
      let payload: TokenResponse;
      try {
        const response = await fetch(`/api/collab/token/${docId}`, {
          method: 'POST',
        });
        payload = await response.json();
      } catch {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: 'Could not reach the collaboration service.',
          });
        }
        return;
      }

      if (cancelled) return;
      if (!payload.success || !payload.token || !payload.appId) {
        setPhase({
          kind: 'error',
          message: payload.message ?? 'You do not have access to this draft.',
        });
        return;
      }

      ydoc = new Y.Doc();
      provider = new HocuspocusProvider({
        url: `wss://${payload.appId}.collab.tiptap.cloud`,
        name: payload.documentName ?? docId,
        document: ydoc,
        token: payload.token,
        onAuthenticationFailed: () => {
          if (!cancelled) {
            setPhase({
              kind: 'error',
              message: 'Your access to this draft has expired. Reload the page.',
            });
          }
        },
      });

      provider.on('synced', () => {
        if (cancelled || !ydoc) return;

        // Schema-version handshake. Read the room's recorded version once the
        // initial state has arrived: a room written by a newer client must not be
        // edited by this one.
        const meta = ydoc.getMap<number>(META_MAP);
        const roomVersion = meta.get(SCHEMA_VERSION_KEY);

        if (typeof roomVersion === 'number' && roomVersion > COLLAB_SCHEMA_VERSION) {
          setPhase({ kind: 'stale-schema' });
          return;
        }
        if (roomVersion === undefined && canWrite) {
          meta.set(SCHEMA_VERSION_KEY, COLLAB_SCHEMA_VERSION);
        }

        setPhase({ kind: 'connected' });
      });

      // Presence. Awareness state is ephemeral and cheap, which is why cursors
      // can feel live even when text is a beat behind.
      provider.on('awarenessUpdate', ({ states }: { states: any[] }) => {
        if (cancelled) return;
        const peers: Peer[] = states
          .filter((state) => state?.user && state.clientId !== ydoc?.clientID)
          .map((state) => ({
            clientId: state.clientId,
            name: state.user.name ?? 'Someone',
            color: state.user.color ?? '#5A6070',
          }));
        onPeersChangeRef.current?.(peers);
      });

      setSession({ ydoc, provider });
    };

    void connect();

    return () => {
      cancelled = true;
      provider?.destroy();
      ydoc?.destroy();
      setSession(null);
    };
  }, [docId, canWrite]);

  const extensions = useMemo(() => {
    if (!session) return baseExtensions;
    return [
      ...baseExtensions,
      Collaboration.configure({ document: session.ydoc }),
      CollaborationCursor.configure({
        provider: session.provider,
        user: { name: userName, color: colorFor(membershipId) },
      }),
    ];
  }, [session, userName, membershipId]);

  const editable = canWrite && phase.kind === 'connected';

  const editor = useEditor(
    {
      extensions,
      // NO `content` here, and this is not an omission. With Collaboration the
      // Y.Doc is the source of truth; passing initial content makes every client
      // insert its own copy, so the document duplicates once per participant.
      // Seeding an existing document's HTML happens exactly once, server-side,
      // and only into a confirmed-empty room.
      immediatelyRender: false,
      editable,
      editorProps: {
        attributes: { 'aria-label': 'Shared group document editor' },
      },
    },
    [session]
  );

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const focusEditorFromPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (!editor || !editable) return;
      const pm = editor.view.dom as HTMLElement;
      if (pm.contains(e.target as Node)) return;
      e.preventDefault();
      editor.chain().focus('end').run();
    },
    [editor, editable]
  );

  return (
    <ErrorBoundary>
      <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
        {phase.kind === 'error' ? (
          <div
            role="alert"
            className="border-b bg-red-50 px-4 py-2 text-sm text-red-800"
          >
            {phase.message}
          </div>
        ) : null}
        {phase.kind === 'stale-schema' ? (
          <div
            role="alert"
            className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900"
          >
            This draft was opened with a newer version of the editor. Reload the
            page to get the latest version — until then it is read-only, so
            nothing your group wrote can be lost.
          </div>
        ) : null}
        {phase.kind === 'loading' ? (
          <div className="border-b px-4 py-2 text-sm text-gray-600">
            Connecting to your group's draft…
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
