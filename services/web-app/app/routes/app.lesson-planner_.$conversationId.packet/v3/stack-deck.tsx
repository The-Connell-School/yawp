/**
 * The slide deck, built right in the stack (Brian's run 6, item 2). Asking
 * for slides on the stack used to send the teacher back to the chat to watch
 * it built there. Now the stack runs the planner's own turn (the deck kit,
 * the stack's contents, the repair pass), kept as the stack's, and the deck
 * comes back in "Ask the planner" as a card to preview and add, the way a
 * new activity does.
 */
import { useState } from 'react';
import { SlideDeckCard } from '~/components/ai-chat/slide-deck-card';
import { readSlideDeck } from '~/domain/lesson-planner/slide-deck';

const PLANNER_API = '/api/domain/lesson-planner';
const UNREACHABLE = 'The planner could not be reached. Try again in a moment.';

/** What the teacher asked, and the planner's progress label. */
export type DeckBuild = { line: string; label: string };

/** Run the planner's turn for a deck from the stack, reading its progress. */
export function useStackDeckBuild({ conversationId, onLanded }: { conversationId: string; onLanded: () => void }) {
  const [progress, setProgress] = useState<DeckBuild | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function build(message: string, line: string) {
    setError(null);
    setProgress({ line, label: 'Reading your stack' });
    let landed: { reply?: string; messageId?: string; error?: string } | null = null;
    try {
      const response = await fetch(PLANNER_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          intent: 'chat',
          message,
          conversationId,
          surface: 'stack',
          stream: '1',
          requestId: crypto.randomUUID(),
        }).toString(),
      });
      if (!response.body) throw new Error('no stream');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      // Newline-delimited events; a chunk can end mid-line.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const events = buffered.split('\n');
        buffered = events.pop() ?? '';
        for (const raw of events) {
          if (!raw.trim()) continue;
          try {
            const event = JSON.parse(raw);
            if (event.type === 'progress' && event.label) setProgress({ line, label: event.label });
            if (event.type === 'done') landed = event.payload;
          } catch {
            // A torn line: the next one carries on.
          }
        }
      }
    } catch {
      landed = { error: UNREACHABLE };
    } finally {
      setProgress(null);
    }
    if (!landed || landed.error) setError(landed?.error ?? UNREACHABLE);
    else onLanded();
  }

  return { progress, error, build };
}

/** A deck the planner built on the stack, as a card to preview and add. */
export function StackDeckCard({
  conversationId,
  messageId,
  content,
  added,
  replaces,
  onToggle,
  disabled,
  periodMinutes,
}: {
  conversationId: string;
  messageId: string;
  content: string;
  /** This deck is the one in the lesson. */
  added: boolean;
  /** Another deck is in the lesson, and adding this one takes its place. */
  replaces: boolean;
  onToggle: (add: boolean) => void;
  disabled: boolean;
  periodMinutes: number | null;
}) {
  const outcome = readSlideDeck(content);
  if (outcome?.kind !== 'deck') return null;
  return (
    <div data-testid="stack-deck" className="space-y-1">
      <SlideDeckCard
        deck={outcome.deck}
        // Preview, and Close comes back here (run 6, item 3).
        presentHref={`/present/${conversationId}/${messageId}?from=stack`}
        downloadHref={`/present/${conversationId}/${messageId}.pptx`}
        added={added}
        onToggle={onToggle}
        disabled={disabled}
        periodMinutes={periodMinutes}
      />
      {replaces && !added ? (
        <p data-testid="stack-deck-replaces" className="text-xs text-[var(--sv-muted)]">
          Adding it replaces the deck in your lesson.
        </p>
      ) : null}
    </div>
  );
}
