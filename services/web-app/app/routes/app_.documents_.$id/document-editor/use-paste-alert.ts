import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';

const PASTE_ALERT_MIN_CHARS = 200;
// Window during which a paste is treated as "same-document" after a
// copy/cut originating inside this editor. Kept at 5s deliberately — widening
// it trades detection sensitivity for comfort with no clearly-right number;
// left alone pending a product decision.
const SAME_DOC_ORIGIN_WINDOW_MS = 5000;

/**
 * Detects pastes of 200+ characters that did NOT originate from the same
 * document editor, and POSTs a PasteAlert record to the server.
 *
 * Copy-origin tracking: when the user copies OR cuts text from inside this
 * editor, a flag is set for 5 seconds. If a paste arrives while the flag is
 * set, it's treated as a same-document paste and ignored.
 *
 * The flag lives in localStorage (not sessionStorage) so a copy in one tab
 * and paste in another tab of the *same document* are still recognized as
 * one same-document round trip — the key is scoped by docId, so it can't
 * leak across different documents.
 */
export function usePasteAlert(editor: Editor | null, docId: string) {
  useEffect(() => {
    if (!editor) return;

    const sameDocCopyKey = `same-doc-copy-${docId}`;
    let copyTimeout: ReturnType<typeof setTimeout> | null = null;

    const markCopyOrigin = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element =
        container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : (container as Element);

      const inEditor = Boolean(element && editor.view.dom.contains(element));

      if (copyTimeout) {
        clearTimeout(copyTimeout);
        copyTimeout = null;
      }

      if (inEditor) {
        localStorage.setItem(sameDocCopyKey, 'true');
        copyTimeout = setTimeout(() => {
          localStorage.removeItem(sameDocCopyKey);
          copyTimeout = null;
        }, SAME_DOC_ORIGIN_WINDOW_MS);
      } else {
        localStorage.removeItem(sameDocCopyKey);
      }
    };

    const handlePaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const textLength = pastedText.length;

      const copiedFromSameDoc = localStorage.getItem(sameDocCopyKey) === 'true';
      if (copiedFromSameDoc) {
        localStorage.removeItem(sameDocCopyKey);
      }

      if (textLength >= PASTE_ALERT_MIN_CHARS && !copiedFromSameDoc) {
        fetch('/api/paste-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: docId, textLength, content: pastedText }),
        }).catch(() => {});
      }
    };

    document.addEventListener('copy', markCopyOrigin);
    // Cut-then-paste to reorder a paragraph is the same-document round trip
    // as copy-then-paste — track it the same way.
    document.addEventListener('cut', markCopyOrigin);
    editor.view.dom.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('copy', markCopyOrigin);
      document.removeEventListener('cut', markCopyOrigin);
      editor.view.dom.removeEventListener('paste', handlePaste);
      if (copyTimeout) clearTimeout(copyTimeout);
      localStorage.removeItem(sameDocCopyKey);
    };
  }, [editor, docId]);
}
