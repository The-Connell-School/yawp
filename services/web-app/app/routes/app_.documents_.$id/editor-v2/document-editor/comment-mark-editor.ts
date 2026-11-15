import type { Editor } from '@tiptap/core';
import { USER_SOURCE_META } from './extensions/source-tracker';
import { TOOLBAR_SOURCE } from './use-pm-tripwire';

/** Remove every ProseMirror comment mark with the given id (toolbar-authorized). */
export function removeCommentMarkFromEditor(
  editor: Editor,
  commentId: string
): boolean {
  const { state } = editor;
  const markType = state.schema.marks.comment;
  if (!markType) return false;

  let tr = state.tr;
  let changed = false;

  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const hasMark = node.marks.some(
      (m) => m.type === markType && m.attrs.id === commentId
    );
    if (!hasMark) return;
    const from = pos;
    const to = pos + node.nodeSize;
    tr = tr.removeMark(from, to, markType);
    changed = true;
  });

  if (!changed) return false;
  tr = tr.setMeta(USER_SOURCE_META, TOOLBAR_SOURCE);
  editor.view.dispatch(tr);
  return true;
}

/** Strip comment mark from the current selection only. */
export function unsetCommentAtSelection(editor: Editor): boolean {
  return editor
    .chain()
    .focus()
    .setMeta(USER_SOURCE_META, TOOLBAR_SOURCE)
    .unsetComment()
    .run();
}