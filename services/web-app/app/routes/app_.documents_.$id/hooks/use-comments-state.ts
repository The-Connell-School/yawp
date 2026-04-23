import { useCallback, useEffect, useState } from 'react';

export type DocComment = {
  id: string;
  content: string;
  responses: any[];
  [key: string]: any;
};

/**
 * Local state owner for the comments collection. Initialized from
 * loader data; child components (Bar, Comments) call addComment after
 * server mutations to keep the UI in sync.
 *
 * Resyncs if the document id changes (e.g., navigating to a different doc).
 */
export function useCommentsState(initialComments: DocComment[]) {
  const [comments, setComments] = useState<DocComment[]>(initialComments);

  // Resync if the loader-provided comments change wholesale
  // (typically happens on navigation to a different document)
  useEffect(() => {
    setComments(initialComments);
    // We intentionally only re-run when the array reference changes,
    // not on every render — react will only call this effect when
    // the prop reference changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialComments]);

  const addComment = useCallback((comment: DocComment) => {
    setComments((prev) => [...prev, comment]);
  }, []);

  const removeComment = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);

  const addResponse = useCallback((commentId: string, response: any) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, responses: [...(c.responses ?? []), response] }
          : c
      )
    );
  }, []);

  return { comments, addComment, removeComment, addResponse };
}
