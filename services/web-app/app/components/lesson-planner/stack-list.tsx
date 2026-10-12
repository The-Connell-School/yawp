/**
 * The stack as one simple list the teacher sequences (Brian's run 2, A1, A2).
 *
 * Drag a piece, or use its up and down buttons, to put the lesson in the
 * order it will be taught; the order saves itself. Remove sits on every row.
 * There are no filters: Brian found they added a place to get lost. Clicking
 * a piece's name still jumps to it.
 *
 * Shared by the stack page and the stack panel beside the chat (A7).
 */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  GripVertical,
  Presentation,
  Rows,
  Trash2,
} from 'lucide-react';
import { cn } from '~/utils/misc';
import type { PacketSectionKind } from '~/domain/lesson-planner/lesson-packet';
import type { StackItem } from '~/domain/lesson-planner/stack-items';

export type StackListItem = StackItem;

const KIND_TEXT: Record<PacketSectionKind, string> = {
  plan: 'Plan',
  handout: 'Handout',
  slides: 'Slides',
};

function KindGlyph({ kind }: { kind: PacketSectionKind }) {
  if (kind === 'handout') return <FileText size={13} className="shrink-0" />;
  if (kind === 'slides') return <Presentation size={13} className="shrink-0" />;
  return <Rows size={13} className="shrink-0" />;
}

/** Move `key` to `to`, the index it should end up at. */
export function moveKey(order: string[], key: string, to: number): string[] {
  const from = order.indexOf(key);
  if (from < 0) return order;
  const next = order.filter((other) => other !== key);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, key);
  return next;
}

export function StackList({
  items,
  onReorder,
  onRemove,
  onJump,
  compact = false,
}: {
  items: StackListItem[];
  /** The whole new order, as keys. */
  onReorder: (keys: string[]) => void;
  onRemove: (item: StackListItem) => void;
  onJump?: (item: StackListItem) => void;
  /** The narrow panel beside the chat: no minutes column, tighter rows. */
  compact?: boolean;
}) {
  const incoming = items.map((item) => item.key);
  const [order, setOrder] = useState(incoming);
  // A new piece, a removal, or a fresh load from the server resets the list
  // to what the server says. The teacher's own moves are already in it.
  const signature = incoming.join('|');
  useEffect(() => {
    setOrder(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const dragging = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byKey = new Map(items.map((item) => [item.key, item]));
  const shown = order
    .map((key) => byKey.get(key))
    .filter((item): item is StackListItem => Boolean(item));

  function commit(next: string[]) {
    if (next.join('|') === order.join('|')) return;
    setOrder(next);
    onReorder(next);
  }

  return (
    <ol
      data-testid="stack-list"
      aria-label="Your stack, in teaching order"
      className="flex flex-col gap-1"
    >
      {shown.map((item, index) => (
        <li
          key={item.key}
          data-testid="stack-list-row"
          draggable
          onDragStart={(event) => {
            dragging.current = item.key;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.key);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (over !== item.key) setOver(item.key);
          }}
          onDragLeave={() => setOver((current) => (current === item.key ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            const key = dragging.current ?? event.dataTransfer.getData('text/plain');
            dragging.current = null;
            setOver(null);
            if (!key || key === item.key) return;
            commit(moveKey(order, key, order.indexOf(item.key)));
          }}
          onDragEnd={() => {
            dragging.current = null;
            setOver(null);
          }}
          className={cn(
            'group flex items-center gap-1 rounded-lg border border-transparent bg-background px-1 py-1 text-sm transition',
            over === item.key && 'border-primary/50 bg-primary/5'
          )}
        >
          <span
            aria-hidden
            className="cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground"
          >
            <GripVertical size={14} />
          </span>
          <span className="text-muted-foreground/70" title={item.label ?? KIND_TEXT[item.kind]}>
            <KindGlyph kind={item.kind} />
          </span>
          <button
            type="button"
            onClick={() => onJump?.(item)}
            className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-foreground hover:text-primary"
          >
            {item.title}
          </button>
          {!compact && item.minutes !== null ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
              {item.minutes}m
            </span>
          ) : null}
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              aria-label={`Move ${item.title} up`}
              title="Move up"
              disabled={index === 0}
              onClick={() => commit(moveKey(order, item.key, index - 1))}
              className="rounded p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
            >
              <ArrowUp size={13} />
            </button>
            <button
              type="button"
              aria-label={`Move ${item.title} down`}
              title="Move down"
              disabled={index === shown.length - 1}
              onClick={() => commit(moveKey(order, item.key, index + 1))}
              className="rounded p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
            >
              <ArrowDown size={13} />
            </button>
            <button
              type="button"
              aria-label={`Remove ${item.title} from the stack`}
              title="Remove from stack"
              data-testid="stack-list-remove"
              onClick={() => onRemove(item)}
              className="rounded p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={13} />
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
