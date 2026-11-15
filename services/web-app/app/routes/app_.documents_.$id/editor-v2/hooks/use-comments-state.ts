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
export type PendingCommentDraft = {
  id: string;
  excerpt: string;
};

export function useCommentsState(initialComments: DocComment[]) {
  const [comments, setComments] = useState<DocComment[]>(initialComments);
  const [pendingFocusCommentId, setPendingFocusCommentId] = useState<
    string | null
  >(null);
  const [pendingDraft, setPendingDraft] = useState<PendingCommentDraft | null>(
    null
  );

  // Resync if the loader-provided comments change wholesale
  // (typically happens on navigation to a different document)
  useEffect(() => {
    setComments((prev) => {
      const byId = new Map<string, DocComment>();
      for (const c of initialComments) byId.set(c.id, c);
      for (const c of prev) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }
      return Array.from(byId.values());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialComments]);

  const addComment = useCallback((comment: DocComment) => {
    setComments((prev) => {
      const index = prev.findIndex((c) => c.id === comment.id);
      if (index === -1) return [...prev, comment];
      const next = [...prev];
      next[index] = { ...next[index], ...comment };
      return next;
    });
    setPendingFocusCommentId(comment.id);
  }, []);

  const clearPendingFocusCommentId = useCallback(() => {
    setPendingFocusCommentId(null);
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

  const setCommentArchived = useCallback(
    (commentId: string, archivedAt: Date | null) => {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, archivedAt } : c))
      );
    },
    []
  );

  const clearPendingDraft = useCallback(() => {
    setPendingDraft(null);
  }, []);

  return {
    comments,
    addComment,
    removeComment,
    addResponse,
    setCommentArchived,
    pendingFocusCommentId,
    pendingDraft,
    setPendingDraft,
    clearPendingDraft,
    clearPendingFocusCommentId,
  };
}
