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

      if (!copiedFromInsideApp) {
        const eventId =
          textLength >= PASTE_ALERT_MIN_CHARS
            ? `paste_${crypto.randomUUID()}`
            : undefined;
        // Always mark the pasted range so short external pastes still surface in the report.
        editor.commands.markLastPasteAsExternal?.(eventId);

        if (textLength >= PASTE_ALERT_MIN_CHARS) {
          // Attempt to capture real provenance from clipboard data, when available.
        let sourceUrl: string | null = null;
        try {
          const html = event.clipboardData?.getData('text/html') || '';
          const uriList = event.clipboardData?.getData('text/uri-list') || '';
          const mozUrl = event.clipboardData?.getData('text/x-moz-url') || '';
          // CF_HTML headers (Windows) sometimes surface a SourceURL: line.
          const headerMatch = html.match(/SourceURL:([^\r\n]+)/i);
          const uriListFirst = uriList
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l && !l.startsWith('#'));
          const mozFirst = mozUrl.split(/\r?\n/)[0]?.trim();
          const candidate =
            headerMatch?.[1]?.trim() ||
            uriListFirst ||
            (mozFirst && mozFirst.includes('\t')
              ? mozFirst.split('\t')[0]
              : mozFirst) ||
            null;
          if (candidate) {
            const u = new URL(candidate);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
              sourceUrl = u.toString();
            }
          }
        } catch {
          // Swallow — provenance is optional.
        }

        fetch('/api/paste-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: docId,
            textLength,
            content: pastedText,
            eventId: eventId!,
            ...(sourceUrl ? { sourceUrl } : {}),
          }),
        }).catch(() => {});
        }
      }
    };

    editor.view.dom.addEventListener('paste', handlePaste);

    return () => {
      editor.view.dom.removeEventListener('paste', handlePaste);
    };
  }, [editor, docId]);
}
