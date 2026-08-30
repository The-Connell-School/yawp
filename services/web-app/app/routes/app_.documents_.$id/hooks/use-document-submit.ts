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
      const bridge = editorBridgeRef.current;
      // On narrow legacy document screens the Editor tab can be unmounted
      // while Tutor or Comments remains active. In that established flow
      // there is no mounted editor state to flush, so submit the last saved
      // server document exactly as before. When an editor is mounted, fail
      // closed unless its forced save reaches the server.
      if (bridge) {
        const saveStatus = await bridge.saveNow({ source: 'pre-submit-flush' });
        if (saveStatus !== 'synced') {
          toast.error(
            'Your latest changes could not be saved. Check your connection and try again before submitting.'
          );
          return;
        }
      }

      // 2. POST submit
      const formData = new FormData();
      formData.append('documentId', documentId);
      if (title) formData.append('title', title);
      const res = await fetch('/api/domain/submit-document', {
        method: 'POST',
        body: formData,
        // Default fetch follows redirects; redirectWithToast (302) becomes a 200 HTML
        // response from the redirect target — res.ok is true, JSON parse fails, and we
        // must not treat that as success.
        redirect: 'manual',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error((body as any)?.message ?? 'Submission failed.');
        return;
      }

      const body = await res.json().catch(() => ({}));

      const submission = (body as { submission?: { id: string; title: string; submittedAt: Date | string } })
        .submission;
      if (!submission?.id) {
        toast.error('Submission failed: invalid server response.');
        return;
      }

      toast.success('Submitted!');
      onSubmitted?.({
        id: submission.id,
        title: submission.title,
        submittedAt:
          typeof submission.submittedAt === 'string'
            ? submission.submittedAt
            : submission.submittedAt.toISOString(),
      });
    } catch (err) {
      toast.error('Submission failed: ' + (err instanceof Error ? err.message : 'unknown'));
    } finally {
      setIsSubmitting(false);
    }
  }, [documentId, editorBridgeRef, isSubmitting, onSubmitted]);

  return { submitNow, isSubmitting };
}
