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
 */
export function usePasteAlert(editor: Editor | null, docId: string) {
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const textLength = pastedText.length;
      const copiedFromInsideApp = wasCopiedInsideApp(pastedText);

      if (textLength >= PASTE_ALERT_MIN_CHARS && !copiedFromInsideApp) {
        fetch('/api/paste-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: docId, textLength, content: pastedText }),
        }).catch(() => {});
      }
    };

    editor.view.dom.addEventListener('paste', handlePaste);

    return () => {
      editor.view.dom.removeEventListener('paste', handlePaste);
    };
  }, [editor, docId]);
}
