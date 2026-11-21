/**
 * Ask Yawp! in the deck studio (Nov 19; Kevin, Nov 18: "speak to the whole
 * thing and have that edit the whole thing, and also go in and edit one
 * part").
 *
 * One line in, the deck in the editor changed, a short answer out with what
 * changed and Undo. With a part of a slide pointed at, the line is about that
 * part. Nothing here saves: the teacher saves the deck as they do after
 * typing on it. The lines live with the page, not in the lesson's chat.
 */
import { useId, useRef, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { DeckChange } from '~/domain/lesson-planner/deck-command';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';
import { cn } from '~/utils/misc';

/** The one part of a slide a line is about. */
export type DeckPointing = {
  /** The slide's number, from 1. */
  slide: number;
  field: string;
  index?: number;
  key?: string;
  /** "Slide 3, question", for the teacher. */
  label: string;
  /** Its words now. */
  text: string;
};

type Line =
  | { id: number; from: 'teacher'; text: string; pointing?: string }
  | { id: number; from: 'yawp'; text: string; changes?: DeckChange[]; before?: SlideDeck; undone?: boolean };

const SUGGESTIONS = ['Fewer words on every slide', 'Add a check for understanding'];

function ChangeRow({ change }: { change: DeckChange }) {
  const [what, detail] =
    change.kind === 'removed'
      ? ['Removed', `“${change.title}”`]
      : change.kind === 'added'
        ? [`New slide ${change.slide}`, change.title]
        : change.kind === 'moved'
          ? ['Moved', `“${change.title}” is now slide ${change.slide}`]
          : change.kind === 'deck'
            ? ['Deck', change.title]
            : [`Slide ${change.slide}`, `“${change.title}” changed`];
  return (
    <li className="flex gap-2.5 rounded-lg border bg-muted/40 px-3 py-2">
      <strong className="shrink-0 font-semibold">{what}</strong>
      <span className="min-w-0">{detail}</span>
    </li>
  );
}

export function DeckChat({
  conversationId,
  deckId,
  deck,
  pointing,
  onStopPointing,
  onApply,
  onRestore,
}: {
  conversationId: string;
  deckId: string;
  /** The deck in the editor now, saved or not. */
  deck: SlideDeck;
  pointing: DeckPointing | null;
  onStopPointing: () => void;
  /** Put Yawp!'s deck in the editor. */
  onApply: (deck: SlideDeck) => void;
  /** Put a deck from before a change back. */
  onRestore: (deck: SlideDeck) => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const inputId = useId();

  async function send(text: string) {
    const line = text.trim();
    if (!line || busy) return;
    setBusy(true);
    setError(null);
    const before = deck;
    const about = pointing;
    try {
      const response = await fetch('/api/domain/lesson-planner/deck-command', {
        method: 'POST',
        body: new URLSearchParams({
          conversationId,
          deckId,
          deck: JSON.stringify(deck),
          line,
          selection: about ? JSON.stringify({ slide: about.slide, field: about.field, index: about.index, key: about.key, text: about.text }) : '',
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        reply?: string;
        applied?: boolean;
        deck?: SlideDeck;
        changes?: DeckChange[];
        error?: string;
        message?: string;
      };
      // A locked or over-budget account answers with a code and a message.
      if (!response.ok || !body.reply) throw new Error(body.message ?? body.error ?? 'Yawp! could not make that change. Try again.');
      const changed = Boolean(body.applied && body.deck);
      if (changed) onApply(body.deck!);
      setLines((current) => [
        ...current,
        { id: nextId.current++, from: 'teacher', text: line, ...(about ? { pointing: about.label } : {}) },
        { id: nextId.current++, from: 'yawp', text: body.reply!, ...(changed ? { changes: body.changes ?? [], before } : {}) },
      ]);
      setDraft('');
      if (about) onStopPointing();
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function undo(id: number, before: SlideDeck) {
    onRestore(before);
    setLines((current) => [
      ...current.map((line) => (line.id === id && line.from === 'yawp' ? { ...line, undone: true } : line)),
      { id: nextId.current++, from: 'yawp', text: 'Put back as it was.' },
    ]);
  }

  // Only the newest change can be undone: an older one would take the later ones with it.
  const undoable = [...lines].reverse().find((line) => line.from === 'yawp' && line.before && !line.undone)?.id;

  return (
    <aside data-testid="deck-chat" aria-label="Ask Yawp!" className="flex min-h-[24rem] flex-col gap-3 rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]">
      <div>
        <h2 className="text-sm font-semibold">Ask Yawp!</h2>
        <p className="text-xs text-muted-foreground">Talk about the whole deck, or click one part of a slide and ask about that.</p>
      </div>

      <div role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-sm">
        {lines.map((line) =>
          line.from === 'teacher' ? (
            <div key={line.id} className="flex max-w-[90%] flex-col gap-1.5 self-end rounded-2xl bg-muted px-3 py-2">
              {line.pointing ? (
                <span className="self-start rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-primary">{line.pointing}</span>
              ) : null}
              <span>{line.text}</span>
            </div>
          ) : (
            <div key={line.id} className="flex flex-col gap-2">
              <p>{line.text}</p>
              {line.changes?.length ? (
                <ul data-testid="deck-chat-changes" className="flex flex-col gap-1.5">
                  {line.changes.map((change, index) => (
                    <ChangeRow key={index} change={change} />
                  ))}
                </ul>
              ) : null}
              {line.before && line.id === undoable ? (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => undo(line.id, line.before!)}>
                    Undo these changes
                  </Button>
                </div>
              ) : null}
            </div>
          )
        )}
        {busy ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Working on the deck…
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!lines.length && !pointing ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <Button key={suggestion} type="button" variant="outline" size="sm" disabled={busy} onClick={() => void send(suggestion)}>
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}

      <div className={cn('flex flex-col gap-1.5 rounded-xl border bg-background p-2.5', pointing && 'border-primary')}>
        {pointing ? (
          <div className="flex items-center gap-1">
            <span data-testid="deck-chat-pointing" className="min-w-0 truncate rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Pointing at: {pointing.label}
            </span>
            <button
              type="button"
              aria-label="Stop pointing at this part"
              onClick={onStopPointing}
              className="rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : null}
        <label htmlFor={inputId} className="text-xs font-semibold text-muted-foreground">
          {pointing ? 'Ask about this part' : 'Ask about the whole deck'}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={inputId}
            value={draft}
            rows={2}
            maxLength={600}
            placeholder={pointing ? 'Tell Yawp! what to change here…' : 'Tell Yawp! what to change…'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            className="min-w-0 flex-1 resize-none bg-transparent text-sm outline-none"
          />
          <Button type="button" size="sm" aria-label="Send" disabled={busy || !draft.trim()} onClick={() => void send(draft)}>
            <Send size={15} aria-hidden />
          </Button>
        </div>
      </div>
    </aside>
  );
}
