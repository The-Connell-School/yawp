import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';
// The custom extensions live with the solo editor and are imported, never copied
// or modified. All three are plain ProseMirror extensions with no DOM access, so
// they load server-side.
import { EmDash } from '~/routes/app_.documents_.$id/document-editor/extensions/em-dash';
import { LineHeight } from '~/routes/app_.documents_.$id/document-editor/extensions/line-height';
import { TabIndent } from '~/routes/app_.documents_.$id/document-editor/extensions/tab-indent';

/**
 * The document schema for collaborative drafts — the single definition shared by
 * the browser editor and the server-side snapshot conversion.
 *
 * Shared on purpose, and it is the most important thing in this file. If the
 * server converted a document with a different extension set than the editor
 * wrote it with, `generateHTML` would silently drop every node it did not
 * recognise, and the dual-written snapshot that grading and submission read would
 * be quietly missing content. One definition makes that class of bug impossible
 * rather than merely unlikely.
 *
 * Two deliberate differences from the solo editor's list:
 *
 * - `history: false`. The Collaboration extension replaces ProseMirror's undo
 *   stack with y-undo; leaving both installed makes undo reach across
 *   collaborators and revert their edits. The Collaboration extensions themselves
 *   are added in the browser only, since they close over a Y.Doc and a provider.
 * - No Comment/SourceTracker/PastedSource. Those are anchored to solo-document
 *   behavior — paste detection in particular fires on copying from a partner's
 *   paragraph, which is ordinary here. They return once collaborator-aware.
 *
 * Bump COLLAB_SCHEMA_VERSION whenever this list gains or loses a node or mark, so
 * a client with an older bundle joins read-only instead of dropping content it
 * cannot represent.
 */
export const collaborativeSchemaExtensions = [
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

/**
 * Bumped whenever `collaborativeSchemaExtensions` gains or loses a node or mark.
 *
 * A client whose bundle knows fewer node types than the room's content can
 * silently drop what it cannot represent, and in a shared document that damages
 * everyone's draft rather than just the stale client's.
 */
export const COLLAB_SCHEMA_VERSION = 1;

/**
 * Re-exported so every existing importer keeps reaching it here; it lives in its
 * own module because the demo seed needs it without TipTap in tow.
 */
export { COLLAB_FRAGMENT_FIELD } from './fragment';

/** Y.Map holding room metadata that is not document content. */
export const COLLAB_META_MAP = 'yawpMeta';
export const COLLAB_SCHEMA_VERSION_KEY = 'schemaVersion';
