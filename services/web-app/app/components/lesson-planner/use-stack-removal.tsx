/**
 * Removing a piece from the stack (Brian's review, B2; run 2, A2 and A7).
 *
 * The piece disappears at once and an Undo sits on screen for a few seconds;
 * only then is it actually removed. A confirm dialog asks the teacher to be
 * sure every time, while Undo only costs the teacher who slipped. Leaving the
 * page commits whatever is still waiting. Shared by the stack page and the
 * stack panel beside the chat, so both behave the same way.
 */
import { useEffect, useRef, useState } from 'react';

/** How long a removed piece can still be brought back. */
export const REMOVE_UNDO_MS = 6000;

export type RemovableStackPiece = {
  id: string;
  title: string;
  origin: 'reply' | 'material';
};

function commitRemoval(conversationId: string, piece: RemovableStackPiece) {
  const body = new FormData();
  body.set('conversationId', conversationId);
  if (piece.origin === 'material') {
    body.set('intent', 'delete-material');
    body.set('materialId', piece.id);
  } else {
    body.set('intent', 'drop');
    body.set('messageId', piece.id);
  }
  return fetch('/api/domain/lesson-planner/packet', {
    method: 'POST',
    body,
    keepalive: true,
  });
}

export function useStackRemoval({
  conversationId,
  onCommitted,
}: {
  conversationId: string;
  /** After the removal reached the server: refresh whatever shows the stack. */
  onCommitted: (piece: RemovableStackPiece) => void;
}) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [undoable, setUndoable] = useState<{ id: string; title: string } | null>(
    null
  );
  const pending = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>()
  );
  const committed = useRef(onCommitted);
  committed.current = onCommitted;

  function remove(piece: RemovableStackPiece) {
    setHiddenIds((ids) => [...ids, piece.id]);
    setUndoable({ id: piece.id, title: piece.title });
    const commit = () => {
      pending.current.delete(piece.id);
      void commitRemoval(conversationId, piece).then(() => {
        setUndoable((current) => (current?.id === piece.id ? null : current));
        committed.current(piece);
      });
    };
    pending.current.set(piece.id, {
      timer: setTimeout(commit, REMOVE_UNDO_MS),
      commit,
    });
  }

  function undo(id: string) {
    const waiting = pending.current.get(id);
    if (waiting) clearTimeout(waiting.timer);
    pending.current.delete(id);
    setHiddenIds((ids) => ids.filter((other) => other !== id));
    setUndoable(null);
  }

  useEffect(() => {
    const waiting = pending.current;
    return () => {
      for (const { timer, commit } of waiting.values()) {
        clearTimeout(timer);
        commit();
      }
    };
  }, []);

  return { hiddenIds, undoable, remove, undo };
}

export function StackUndoToast({
  undoable,
  onUndo,
}: {
  undoable: { id: string; title: string } | null;
  onUndo: (id: string) => void;
}) {
  if (!undoable) return null;
  return (
    <div
      role="status"
      data-testid="remove-undo"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background shadow-lg print:hidden"
    >
      <span>Removed “{undoable.title}” from the stack</span>
      <button
        type="button"
        onClick={() => onUndo(undoable.id)}
        className="font-semibold underline underline-offset-2"
      >
        Undo
      </button>
    </div>
  );
}
