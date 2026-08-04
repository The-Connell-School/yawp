import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';

const PASTE_ALERT_MIN_CHARS = 200;

/**
 * Detects pastes of 200+ characters that did NOT originate from the same
 * document editor, and POSTs a PasteAlert record to the server.
 *
 * Copy-origin tracking: when the user copies text from inside this editor,
 * a sessionStorage flag is set for 5 seconds. If a paste arrives while the
 * flag is set, it's treated as a same-document paste and ignored.
 */
export function usePasteAlert(editor: Editor | null, docId: string) {
  useEffect(() => {
    if (!editor) return;

    const sameDocCopyKey = `same-doc-copy-${docId}`;
    let copyTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleCopy = () => {
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
        sessionStorage.setItem(sameDocCopyKey, 'true');
        copyTimeout = setTimeout(() => {
          sessionStorage.removeItem(sameDocCopyKey);
          copyTimeout = null;
        }, 5000);
      } else {
        sessionStorage.removeItem(sameDocCopyKey);
      }
    };

    const handlePaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const textLength = pastedText.length;

      const copiedFromSameDoc =
        sessionStorage.getItem(sameDocCopyKey) === 'true';
      if (copiedFromSameDoc) {
        sessionStorage.removeItem(sameDocCopyKey);
      }

      if (textLength >= PASTE_ALERT_MIN_CHARS && !copiedFromSameDoc) {
        fetch('/api/paste-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: docId,
            textLength,
            content: pastedText,
          }),
        }).catch(() => {});
      }
    };

    document.addEventListener('copy', handleCopy);
    editor.view.dom.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('copy', handleCopy);
      editor.view.dom.removeEventListener('paste', handlePaste);
      if (copyTimeout) clearTimeout(copyTimeout);
      sessionStorage.removeItem(sameDocCopyKey);
    };
  }, [editor, docId]);
}
