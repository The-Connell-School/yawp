/**
 * The library's moves and their Undo (Oct 24 handoff, Part 2): every create,
 * move, group, ungroup, reorder and insert shows the dark status bar with
 * Undo, which puts the library back as it was.
 */
import { useEffect, useState } from 'react';
import { useFetcher, useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { cn } from '~/utils/misc';

export const LIBRARY_API = '/api/domain/lesson-planner/library';

type Answer = { ok?: boolean; message?: string; undo?: string; error?: string; conversationId?: string; unitId?: string; day?: number };

export function useLibraryAction() {
  const fetcher = useFetcher<Answer>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ message: string; undo: string | null } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    const answer = fetcher.data;
    if (answer.error) setStatus({ message: answer.error, undo: null });
    else if (answer.message) setStatus({ message: answer.message, undo: answer.undo ?? null });
    if (opening && answer.conversationId) {
      setOpening(null);
      navigate(`/app/lesson-planner?c=${answer.conversationId}`);
    }
    // Once per answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  function run(fields: Record<string, string | number | null | undefined>, options: { open?: boolean } = {}) {
    const form = Object.fromEntries(
      Object.entries(fields).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== null).map(([key, value]) => [key, String(value)])
    );
    if (options.open) setOpening('yes');
    fetcher.submit(form, { method: 'post', action: LIBRARY_API });
  }

  function undo() {
    if (!status?.undo) return;
    const token = status.undo;
    setStatus({ message: 'Undoing…', undo: null });
    fetcher.submit({ intent: 'undo', undo: token }, { method: 'post', action: LIBRARY_API });
  }

  return {
    run,
    undo,
    status,
    dismiss: () => setStatus(null),
    busy: fetcher.state !== 'idle',
    /** The last answer, once it is in. */
    answer: fetcher.state === 'idle' ? fetcher.data : undefined,
  };
}

export function UndoBar({
  status,
  onUndo,
  onDismiss,
  raised = false,
}: {
  status: { message: string; undo: string | null } | null;
  onUndo: () => void;
  onDismiss: () => void;
  /** Above the select bar, when that is showing. */
  raised?: boolean;
}) {
  if (!status) return null;
  return (
    <div
      role="status"
      data-testid="library-status"
      className={cn(
        'fixed left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-4 rounded-xl bg-[#1C1A17] px-4 py-3 text-sm text-white shadow-lg',
        raised ? 'bottom-24' : 'bottom-6'
      )}
    >
      <span data-testid="library-status-message">{status.message}</span>
      {status.undo ? (
        <button type="button" data-testid="library-undo" onClick={onUndo} className="font-semibold text-[#F4A68A] hover:underline">
          Undo
        </button>
      ) : null}
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-white/60 hover:text-white">
        <X size={14} />
      </button>
    </div>
  );
}
