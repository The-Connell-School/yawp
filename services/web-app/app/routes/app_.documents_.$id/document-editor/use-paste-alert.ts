import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';

const PASTE_ALERT_MIN_CHARS = 200;

// App-wide (not per-document, not per-tab) provenance flag: "the most
// recent copy/cut anywhere in YAWP came from inside YAWP." Lives in
// localStorage so it's visible across tabs of the same browser profile.
//
// The rule, per Bryant: anything copied or cut from inside the app and
// pasted back into the app is never an alert — regardless of which
// document, which tab, or how much time passed. Only content that arrived
// from outside the app should raise one. A global, non-expiring,
// cross-tab flag is the simplest way to express that rule directly,
// rather than the narrower "same document, same tab, within 5s" proxy
// this used to check.
//
// What this still can't catch: a student who copies from YAWP, then
// copies something *else* from outside YAWP before pasting, would slip
// through as a false negative (the flag stays set until consumed by the
// next paste). And it doesn't cross browser profiles or devices — a copy
// in one profile/incognito window and paste in another looks external.
// Both are accepted misses: a false alarm here wrongly implies a student
// did something they didn't, which is worse than an occasional miss.
const APP_INTERNAL_COPY_KEY = 'yawp-internal-clipboard-copy';

function markInternalCopy() {
  localStorage.setItem(APP_INTERNAL_COPY_KEY, 'true');
}

function consumeInternalCopyFlag(): boolean {
  const wasInternal = localStorage.getItem(APP_INTERNAL_COPY_KEY) === 'true';
  if (wasInternal) {
    localStorage.removeItem(APP_INTERNAL_COPY_KEY);
  }
  return wasInternal;
}

/**
 * Detects pastes of 200+ characters that did NOT originate from inside
 * YAWP, and POSTs a PasteAlert record to the server.
 */
export function usePasteAlert(editor: Editor | null, docId: string) {
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const textLength = pastedText.length;
      const copiedFromInsideApp = consumeInternalCopyFlag();

      if (textLength >= PASTE_ALERT_MIN_CHARS && !copiedFromInsideApp) {
        fetch('/api/paste-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: docId, textLength, content: pastedText }),
        }).catch(() => {});
      }
    };

    // Any copy or cut anywhere in the app (not just this editor) marks
    // the next paste as app-internal — a student copying from a prompt
    // panel, another document, etc. and pasting into this editor is still
    // a same-app round trip.
    document.addEventListener('copy', markInternalCopy);
    document.addEventListener('cut', markInternalCopy);
    editor.view.dom.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('copy', markInternalCopy);
      document.removeEventListener('cut', markInternalCopy);
      editor.view.dom.removeEventListener('paste', handlePaste);
      // Deliberately not clearing the flag here — it's app-wide, not
      // scoped to this editor's lifetime. Clearing it on unmount would
      // break the exact cross-page case this is meant to cover: copy on
      // one page, navigate, paste on another.
    };
  }, [editor, docId]);
}
