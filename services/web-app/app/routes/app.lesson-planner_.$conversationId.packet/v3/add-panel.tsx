/**
 * Add a piece (stack page redesign): slides in from the right so the teacher
 * stays on the stack. "From your conversation" lists what the planner offered
 * that is not in the stack yet, each with what adding it does to the time and
 * the writing. "Ask the planner" is the stack's chat: a change comes back as
 * one line with Undo, a new piece as a card (Kevin's note on run 3, item 7).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { GripVertical, Lightbulb, Loader2, Plus, Send, X } from 'lucide-react';
import type { SuggestedPiece } from '~/domain/lesson-planner/stack-suggestions';
import { stackTiming, type StackTiming, type TimedStep } from '~/domain/lesson-planner/stack-timing';
import { DEFAULT_STEP_MINUTES } from '~/domain/lesson-planner/step-types';
import { cn } from '~/utils/misc';
import { MarkdownContent } from '~/components/ai-chat/assistant-markdown';
import { HEADING_FONT } from './theme';
import { PIECE_DRAG_TYPE, TypeChip, WritingBadge } from './run-of-show';
import { hasSlideDeck } from '~/domain/lesson-planner/slide-deck';
import { StackDeckCard, type DeckBuild } from './stack-deck';

/** A deck built on the stack (Brian's run 6, item 2). */
export type PanelDeck = {
  /** The reply the lesson's deck was filed from, if it has one. */
  sourceMessageId: string | null;
  hasDeck: boolean;
  onToggle: (messageId: string, add: boolean) => void;
  building: DeckBuild | null;
  error: string | null;
  periodMinutes: number | null;
  /** The deck editor is on: built decks offer Edit (Brian's round 5, item 5). */
  editable: boolean;
  /** The lesson's deck as the teacher edited it, by its filed id. */
  edited: { id: string; content: string } | null;
  /** A deck from the chat not yet in the lesson (run 6, round 2). */
  fromConversation: { messageId: string; content: string } | null;
};

export type AskTurn = { id: string; role: 'user' | 'assistant'; content: string };

/** "+15 min · puts you 15 over · writing to 38%" */
export function impactLine(
  piece: SuggestedPiece,
  steps: TimedStep[],
  timing: StackTiming
): string {
  const minutes = piece.minutes ?? DEFAULT_STEP_MINUTES[piece.type];
  const next = stackTiming(
    [...steps, { id: piece.token, title: piece.title, type: piece.type, minutes, isWriting: piece.isWriting }],
    timing.period
  );
  const parts = [`+${minutes} min`];
  if (next.over > 0) parts.push(`puts you ${next.over} over`);
  else if (timing.period) parts.push(`${next.leftover} min to spare`);
  if (piece.isWriting) parts.push(`writing to ${next.writingPercent}%`);
  return parts.join(' · ');
}

function PieceCard({
  piece,
  impact,
  onAdd,
  onDragStart,
  onDragEnd,
  busy,
}: {
  piece: SuggestedPiece;
  impact: string;
  onAdd: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  busy: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  return (
    <article
      data-testid="suggestion-card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(PIECE_DRAG_TYPE, JSON.stringify({ messageId: piece.messageId, key: piece.key }));
        event.dataTransfer.effectAllowed = 'copy';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="rounded-xl border border-[var(--sv-line)] bg-[var(--sv-card)] p-3"
    >
      <div className="flex items-start gap-2">
        <GripVertical size={14} className="mt-1 shrink-0 cursor-grab text-[var(--sv-muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-1.5">
              <TypeChip step={{ type: piece.type, label: null }} />
              {piece.isWriting ? <WritingBadge /> : null}
            </span>
            <span className="text-xs font-semibold tabular-nums text-[var(--sv-muted)]">
              {piece.minutes ?? DEFAULT_STEP_MINUTES[piece.type]} min
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold">{piece.title}</p>
          {previewing ? (
            <div data-testid="suggestion-preview" className="mt-1 max-h-72 overflow-y-auto rounded-lg bg-[#FBF8F3] p-2 text-xs">
              <MarkdownContent content={piece.content || piece.line} codeAsText />
            </div>
          ) : piece.line ? (
            <p className="mt-0.5 text-xs text-[var(--sv-muted)]">{piece.line}</p>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span data-testid="suggestion-impact" className="text-[11px] font-semibold text-[var(--sv-primary)]">
              {impact}
            </span>
            <span className="flex items-center gap-1.5">
            {/* Read the whole piece first (Brian's run 5, item 5). */}
            <button
              type="button"
              data-testid="suggestion-preview-toggle"
              aria-expanded={previewing}
              onClick={() => setPreviewing((open) => !open)}
              className="rounded-full border border-[var(--sv-line)] px-3 py-1 text-xs font-semibold transition hover:bg-[#F1EBE2]"
            >
              {previewing ? 'Hide' : 'Preview'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onAdd}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--sv-primary)] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={12} /> Add
            </button>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function AddPanel({
  conversationId,
  open,
  tab,
  setTab,
  onClose,
  where,
  timing,
  steps,
  suggestions,
  askHistory,
  onAdd,
  onAsk,
  askBusy,
  lastAnswer,
  onUndo,
  onDragPiece,
  busy,
  deck = null,
}: {
  conversationId: string;
  open: boolean;
  tab: 'conversation' | 'ask';
  setTab: (tab: 'conversation' | 'ask') => void;
  onClose: () => void;
  /** "Goes in at minute 20, after …", or null when no spot was chosen. */
  where: string | null;
  timing: StackTiming;
  steps: TimedStep[];
  suggestions: SuggestedPiece[];
  askHistory: AskTurn[];
  onAdd: (piece: SuggestedPiece) => void;
  onAsk: (line: string) => void;
  askBusy: boolean;
  /** The last change the stack chat made, with Undo while it stands. */
  lastAnswer: { text: string; canUndo: boolean } | null;
  onUndo: () => void;
  onDragPiece: (dragging: boolean) => void;
  busy: boolean;
  deck?: PanelDeck | null;
}) {
  const [line, setLine] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);
  if (!open) return null;

  const askIds = new Set(askHistory.map((turn) => turn.id));
  const fromConversation = suggestions.filter((piece) => !askIds.has(piece.messageId));
  const piecesByMessage = new Map<string, SuggestedPiece[]>();
  for (const piece of suggestions) {
    if (!askIds.has(piece.messageId)) continue;
    piecesByMessage.set(piece.messageId, [...(piecesByMessage.get(piece.messageId) ?? []), piece]);
  }
  const card = (piece: SuggestedPiece) => (
    <PieceCard
      key={piece.token}
      piece={piece}
      impact={impactLine(piece, steps, timing)}
      onAdd={() => onAdd(piece)}
      onDragStart={() => onDragPiece(true)}
      onDragEnd={() => onDragPiece(false)}
      busy={busy}
    />
  );

  return (
    <aside
      data-testid="add-panel"
      role="dialog"
      aria-label="Add to your lesson"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-[var(--sv-line)] bg-[var(--sv-page)] shadow-2xl"
    >
      <header className="border-b border-[var(--sv-line)] px-5 pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold" style={HEADING_FONT}>
            Add to your lesson
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--sv-line)] transition hover:bg-[#F1EBE2]"
          >
            <X size={15} />
          </button>
        </div>
        {where ? (
          <p data-testid="add-panel-where" className="mt-1 text-xs font-semibold text-[var(--sv-primary)]">
            {where}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span>
            Right now: <strong>{timing.total} of {timing.period ?? timing.total} min</strong>
          </span>
          <span className="rounded-full bg-[#EFE8DD] px-2 py-0.5 font-semibold">{timing.status}</span>
        </div>
        <div role="tablist" className="mt-3 grid grid-cols-2 rounded-lg bg-[#EFE8DD] p-1 text-sm">
          {(['conversation', 'ask'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                'rounded-md py-1.5 font-semibold transition',
                tab === value ? 'bg-[var(--sv-card)] shadow-sm' : 'text-[var(--sv-muted)]'
              )}
            >
              {value === 'conversation' ? 'From your conversation' : 'Ask the planner'}
            </button>
          ))}
        </div>
      </header>

      {tab === 'conversation' ? (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs text-[var(--sv-muted)]">
            The planner suggested these in your conversation. They aren't in the lesson yet. Drag one
            into your lesson, or click Add.
          </p>
          {deck?.fromConversation ? (
            <div className="mb-3">
              <StackDeckCard
                conversationId={conversationId}
                messageId={deck.fromConversation.messageId}
                content={deck.fromConversation.content}
                added={deck.sourceMessageId === deck.fromConversation.messageId}
                replaces={deck.hasDeck}
                onToggle={(add) => deck.onToggle(deck.fromConversation!.messageId, add)}
                disabled={busy}
                periodMinutes={deck.periodMinutes}
                editable={deck.editable}
                edited={deck.sourceMessageId === deck.fromConversation.messageId ? deck.edited : null}
              />
            </div>
          ) : null}
          {fromConversation.length ? (
            <div className="flex flex-col gap-3">{fromConversation.map(card)}</div>
          ) : (
            <p data-testid="no-suggestions" className="rounded-xl border border-dashed border-[var(--sv-line)] p-4 text-sm text-[var(--sv-muted)]">
              Everything the planner suggested is in your lesson. Ask the planner for something new.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div data-testid="ask-thread" className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {askHistory.length === 0 ? (
              <p className="text-xs text-[var(--sv-muted)]">
                Change the lesson in a line — “shorten the hook to 10 minutes” — or ask for a new
                piece. Bigger rethinking belongs in the planner.
              </p>
            ) : null}
            {askHistory.map((turn) =>
              turn.role === 'user' ? (
                <p key={turn.id} className="ml-10 rounded-2xl rounded-br-sm bg-[var(--sv-primary)] px-3 py-2 text-sm text-white">
                  {turn.content}
                </p>
              ) : (
                <div key={turn.id} className="flex gap-2">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FBE5DC] text-[var(--sv-primary)]">
                    <Lightbulb size={12} />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p data-testid="ask-reply" className="text-sm">
                      {turn.content.split('\n').find((text) => text.trim() && !text.startsWith('```')) ?? ''}
                    </p>
                    {(piecesByMessage.get(turn.id) ?? []).map(card)}
                    {deck && hasSlideDeck(turn.content) ? (
                      <StackDeckCard
                        conversationId={conversationId}
                        messageId={turn.id}
                        content={turn.content}
                        added={deck.sourceMessageId === turn.id}
                        replaces={deck.hasDeck}
                        onToggle={(add) => deck.onToggle(turn.id, add)}
                        disabled={busy}
                        periodMinutes={deck.periodMinutes}
                        editable={deck.editable}
                        edited={deck.sourceMessageId === turn.id ? deck.edited : null}
                      />
                    ) : null}
                  </div>
                </div>
              )
            )}
            {deck?.building ? (
              <>
                <p className="ml-10 rounded-2xl rounded-br-sm bg-[var(--sv-primary)] px-3 py-2 text-sm text-white">
                  {deck.building.line}
                </p>
                <p data-testid="stack-deck-building" className="flex items-center gap-2 text-sm text-[var(--sv-muted)]">
                  <Loader2 size={14} className="animate-spin" /> Building your deck · {deck.building.label}
                </p>
              </>
            ) : null}
            {deck?.error ? (
              <p data-testid="stack-deck-error" className="text-sm text-red-700">
                {deck.error}
              </p>
            ) : null}
            {lastAnswer?.canUndo ? (
              <button
                type="button"
                data-testid="ask-undo"
                onClick={onUndo}
                className="ml-8 text-xs font-semibold text-[var(--sv-primary)] underline underline-offset-2"
              >
                Undo
              </button>
            ) : null}
          </div>
          <form
            className="flex items-center gap-2 border-t border-[var(--sv-line)] px-5 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!line.trim()) return;
              onAsk(line.trim());
              setLine('');
            }}
          >
            <label className="sr-only" htmlFor="stack-ask">
              Ask the planner
            </label>
            <input
              id="stack-ask"
              data-testid="stack-ask-input"
              value={line}
              onChange={(event) => setLine(event.target.value)}
              placeholder="Describe what you need…"
              className="min-w-0 flex-1 rounded-full border border-[var(--sv-line)] bg-[var(--sv-card)] px-4 py-2 text-sm outline-none focus:border-[var(--sv-coral)]"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={askBusy || !line.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sv-primary)] text-white transition disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-[var(--sv-line)] px-5 py-3 text-xs">
        <span className="text-[var(--sv-muted)]">Need a bigger change?</span>
        <Link
          to={`/app/lesson-planner?c=${conversationId}`}
          className="font-semibold text-[var(--sv-primary)] underline underline-offset-2"
        >
          Continue in the planner →
        </Link>
      </footer>
    </aside>
  );
}
