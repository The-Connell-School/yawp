import { generateHTML } from '@tiptap/html';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';
import {
  COLLAB_FRAGMENT_FIELD,
  collaborativeSchemaExtensions,
} from './schema';

/**
 * Converting a collaborative document's CRDT state into the plain HTML and text
 * that the rest of Yawp reads.
 *
 * The Y.Doc is the source of truth while a group is writing, but grading, the
 * tutor, search, comments, revision history and submission all read
 * `Document.html` and `Document.text`. This module produces that derived
 * snapshot; `dual-write.server.ts` stores it.
 *
 * Everything here is pure, which is the point — it can be tested against real Yjs
 * documents without a browser or a provider.
 */

export type DocumentSnapshot = {
  html: string;
  text: string;
};

export type ProsemirrorNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: ProsemirrorNode[];
};

/**
 * Nodes that end a line of text. Kept in step with the block nodes StarterKit
 * contributes, so extracted text has the paragraph breaks a word count and the
 * grading prompt expect rather than running everything together.
 */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'codeBlock',
  'horizontalRule',
]);

/**
 * Plain text from a ProseMirror document, walked directly rather than by
 * stripping tags off the generated HTML — going through HTML would turn `&amp;`
 * into `&` inconsistently and lose the block structure.
 */
export function prosemirrorJsonToText(doc: ProsemirrorNode): string {
  const lines: string[] = [];
  let current = '';

  const walk = (node: ProsemirrorNode) => {
    if (node.type === 'text') {
      current += node.text ?? '';
      return;
    }
    if (node.type === 'hardBreak') {
      current += '\n';
      return;
    }

    for (const child of node.content ?? []) walk(child);

    if (node.type && BLOCK_TYPES.has(node.type)) {
      lines.push(current);
      current = '';
    }
  };

  walk(doc);
  if (current.length > 0) lines.push(current);

  // Trailing empty paragraphs are an artifact of editing, not content.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  return lines.join('\n');
}

/**
 * Renders a ProseMirror document to HTML using the shared collaborative schema.
 *
 * The extension list has to be the same one the editor wrote with, or
 * `generateHTML` drops unrecognised nodes without complaint — which is why it
 * lives in `schema.ts` and is imported by both sides.
 */
export function prosemirrorJsonToSnapshot(doc: ProsemirrorNode): DocumentSnapshot {
  const html = generateHTML(doc as any, collaborativeSchemaExtensions);
  return { html, text: prosemirrorJsonToText(doc) };
}

/** The snapshot for an empty document, matching what a fresh Document row holds. */
export const EMPTY_SNAPSHOT: DocumentSnapshot = { html: '', text: '' };

/**
 * Converts a live Y.Doc's ProseMirror fragment into a snapshot.
 *
 * Returns the empty snapshot for a document with no content rather than
 * ProseMirror's `<p></p>` placeholder, so an untouched group draft does not read
 * as "the students wrote an empty paragraph".
 */
export function yDocToSnapshot(ydoc: Y.Doc): DocumentSnapshot {
  const fragment = ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD);
  if (fragment.length === 0) return EMPTY_SNAPSHOT;

  const json = yXmlFragmentToProsemirrorJSON(fragment) as ProsemirrorNode;
  const snapshot = prosemirrorJsonToSnapshot(json);

  // A single empty paragraph is what the editor leaves behind when a student
  // deletes everything; treat it as empty too.
  if (snapshot.text.trim() === '' && !/<(img|hr|table)/i.test(snapshot.html)) {
    return EMPTY_SNAPSHOT;
  }

  return snapshot;
}

/**
 * Converts an encoded Yjs state update into a snapshot.
 *
 * Yjs updates are commutative and idempotent, so applying a full state update to
 * a fresh document reconstructs the room exactly — which is what lets a webhook
 * carry state without the server holding a live connection.
 */
export function yUpdateToSnapshot(update: Uint8Array): DocumentSnapshot {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, update);
    return yDocToSnapshot(ydoc);
  } finally {
    ydoc.destroy();
  }
}
