import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { wasCopiedInsideApp } from '~/utils/internal-copy';

const PASTE_ALERT_MIN_CHARS = 200;

/**
 * Detects pastes of 200+ characters that did NOT originate from inside
 * YAWP, and POSTs a PasteAlert record to the server.
 *
 * The "came from inside YAWP" half of the rule is not tracked here — the
 * /app layout owns it via useInternalCopyMarker, so copies made on any
 * page count, not only those made while an editor happened to be mounted.
 * See app/utils/internal-copy.ts for the rule and its known gaps.
 *
 * The same decision also marks the pasted range in the document, so the
 * passage can be found again while reading the work rather than only
 * counted in a list. ProseMirror has already inserted the clipboard
 * content by the time this listener runs — it is registered on the editor
 * DOM after ProseMirror's own handler — so the range is available on the
 * pastedSource plugin's state. See extensions/pasted-source.ts.
 */
export function usePasteAlert(editor: Editor | null, docId: string) {
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const textLength = pastedText.length;
      const copiedFromInsideApp = wasCopiedInsideApp(pastedText);

      if (textLength >= PASTE_ALERT_MIN_CHARS && !copiedFromInsideApp) {
        const eventId = `paste_${crypto.randomUUID()}`;
        editor.commands.markLastPasteAsExternal?.(eventId);

        fetch('/api/paste-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: docId, textLength, content: pastedText, eventId }),
        }).catch(() => {});
      }
    };

    editor.view.dom.addEventListener('paste', handlePaste);

    return () => {
      editor.view.dom.removeEventListener('paste', handlePaste);
    };
  }, [editor, docId]);
}
