/**
 * The stack beside the chat (Brian's run 2, A7; item 39).
 *
 * As the teacher adds pieces in the chat, they appear here, so the lesson
 * takes shape while they talk with the planner. Remove and reorder work
 * right here, the same way they do on the stack page; "Open the full stack"
 * goes there.
 */
import { useEffect } from 'react';
import { Link, useFetcher } from 'react-router';
import { Layers, X } from 'lucide-react';
import { StackList } from './stack-list';
import { StackUndoToast, useStackRemoval } from './use-stack-removal';
import type { StackItem } from '~/domain/lesson-planner/stack-items';

const PREFERENCE_KEY = 'lesson-planner:stack-panel';

/** Whether the teacher closed the panel; remembered on this device only. */
export function readStackPanelClosed(): boolean {
  try {
    return window.localStorage.getItem(PREFERENCE_KEY) === 'closed';
  } catch {
    return false;
  }
}

export function writeStackPanelClosed(closed: boolean): void {
  try {
    if (closed) window.localStorage.setItem(PREFERENCE_KEY, 'closed');
    else window.localStorage.removeItem(PREFERENCE_KEY);
  } catch {
    // Private windows refuse storage; the panel just opens again next time.
  }
}

export function StackPanel({
  conversationId,
  version,
  onRemoved,
  onClose,
}: {
  conversationId: string;
  /** Bumped by the chat whenever something was filed, so the panel reloads. */
  version: number;
  /** A piece left the stack here, so its chat card stops saying "In the stack". */
  onRemoved: (piece: StackItem) => void;
  onClose: () => void;
}) {
  const list = useFetcher<{ items: StackItem[] }>();
  const reorder = useFetcher();
  const href = `/api/domain/lesson-planner/packet?conversationId=${encodeURIComponent(conversationId)}`;

  useEffect(() => {
    list.load(href);
    // Reload on a new lesson or a new filing; `list` is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href, version]);

  const items = list.data?.items ?? [];
  const { hiddenIds, undoable, remove, undo } = useStackRemoval({
    conversationId,
    // Once the Undo has run out: the chat card follows, and the list reloads.
    onCommitted: (piece) => {
      onRemoved(piece as StackItem);
      list.load(href);
    },
  });
  const shown = items.filter((item) => !hiddenIds.includes(item.id));

  return (
    <aside
      data-testid="stack-panel"
      aria-label="Your stack"
      className="hidden w-80 shrink-0 flex-col border-l bg-secondary/30 lg:flex"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Layers size={16} className="text-primary" />
        <p className="flex-1 text-sm font-semibold">
          Your stack
          <span className="ml-1 font-normal text-muted-foreground">
            · {shown.length} {shown.length === 1 ? 'piece' : 'pieces'}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the stack panel"
          className="rounded-md p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          <X size={15} />
        </button>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {shown.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            Pieces you add from the chat appear here, in teaching order.
          </p>
        ) : (
          <StackList
            compact
            items={shown}
            onReorder={(keys) =>
              reorder.submit(
                { intent: 'reorder', conversationId, order: keys.join(',') },
                { method: 'post', action: '/api/domain/lesson-planner/packet' }
              )
            }
            onRemove={remove}
          />
        )}
      </div>
      <div className="border-t px-4 py-3">
        <Link
          to={`/app/lesson-planner/${conversationId}/packet`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Open the full stack
        </Link>
      </div>
      <StackUndoToast undoable={undoable} onUndo={undo} />
    </aside>
  );
}
