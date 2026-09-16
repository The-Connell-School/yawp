import { generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import { PastedSource } from '~/routes/app_.documents_.$id/document-editor/extensions/pasted-source';

/** Read mark identities using the same HTML schema as the editor. Text that
 * merely mentions an ID (including a pasted source-code example) is not a mark.
 */
export function snapshotPasteEventIds(html: string): string[] {
  const ids = new Set<string>();
  const visit = (node: ReturnType<typeof generateJSON>) => {
    for (const mark of node.marks ?? []) {
      const id = mark.attrs?.eventId;
      if (
        mark.type === 'pastedSource' &&
        typeof id === 'string' &&
        /^paste_[0-9a-f-]{36}$/.test(id)
      )
        ids.add(id);
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(generateJSON(html, [StarterKit, PastedSource]));
  return [...ids];
}
