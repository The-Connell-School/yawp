import { useCallback, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import type { EditorBridge } from '../document-editor/use-editor-sync';

type Options = {
  documentId: string;
  editorBridgeRef: RefObject<EditorBridge | null>;
  onSubmitted?: (submission: { id: string; title: string; submittedAt: string }) => void;
};

/**
 * Encapsulates the flush-then-submit flow:
 * 1. Flush the editor's current content to server via bridge.saveNow
 *    (so the submit endpoint reads the freshest content from the DB)
 * 2. POST to /api/domain/submit-document
 * 3. On success, call onSubmitted (typically triggers a redirect)
 * 4. On failure, surface a toast error
 */
export function useDocumentSubmit({ documentId, editorBridgeRef, onSubmitted }: Options) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitNow = useCallback(async (title?: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // 1. Flush latest editor content to server
      if (editorBridgeRef.current) {
        await editorBridgeRef.current.saveNow({ source: 'pre-submit-flush' });
      }

      // 2. POST submit
      const formData = new FormData();
      formData.append('documentId', documentId);
      if (title) formData.append('title', title);
      const res = await fetch('/api/domain/submit-document', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error((body as any)?.message ?? 'Submission failed.');
        return;
      }

      const body = await res.json().catch(() => ({}));
      toast.success('Submitted!');
      onSubmitted?.(body.submission ?? { id: `temp-${Date.now()}`, title: title ?? '', submittedAt: new Date().toISOString() });
    } catch (err) {
      toast.error('Submission failed: ' + (err instanceof Error ? err.message : 'unknown'));
    } finally {
      setIsSubmitting(false);
    }
  }, [documentId, editorBridgeRef, isSubmitting, onSubmitted]);

  return { submitNow, isSubmitting };
}
