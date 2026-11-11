/**
 * "Do you want me to rework this slide deck for this lesson (your original
 * won't be lost), or keep it as is?" (Brian, Nov 4). Asked in the
 * conversation, under the planner's reply, the way its other follow-up
 * questions are, with "Rework it" first and highlighted.
 *
 * A button saves the choice and sends it as the teacher's message, so the
 * reply that answers it makes the deck and puts it in the stack. A typed
 * answer works the same way (the server reads it). Answered, the card goes.
 */
import { useState } from 'react';
import { CornerDownRight, Presentation } from 'lucide-react';
import { DECK_ASK, deckChoiceMessage } from '~/domain/lesson-planner/deck-choice';
import type { DeckMode } from '~/domain/lesson-planner/lesson-uploads';
import type { DeckChoices, SourceChip } from './source-documents';
import { cn } from '~/utils/misc';

export function DeckAskCard({
  decks,
  choices,
  onChoose,
  disabled,
}: {
  /** Uploaded decks with no answer yet. */
  decks: SourceChip[];
  choices: DeckChoices;
  /** Save the choice, then send it as the teacher's message. */
  onChoose: (deck: SourceChip, mode: DeckMode, message: string) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const options = DECK_ASK.options.filter((option) => choices[option.mode]);
  if (!decks.length || !options.length) return null;
  return (
    // In line with the planner's reply above it.
    <div className="space-y-3 sm:pl-11">
      {decks.map((deck) => (
        <div
          key={deck.id}
          data-testid="deck-ask-card"
          role="group"
          aria-label={DECK_ASK.question}
          className="overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.03] px-4 py-3.5"
        >
          <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Presentation size={13} className="shrink-0" />
            <span className="truncate">{deck.name}</span>
          </p>
          <p className="mb-3 text-sm font-medium">{DECK_ASK.question}</p>
          <div className="flex flex-wrap items-center gap-2">
            {options.map((option, index) => (
              <button
                key={option.mode}
                type="button"
                data-testid={`deck-ask-${option.mode}`}
                disabled={disabled || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onChoose(deck, option.mode, deckChoiceMessage(option.mode, deck.name));
                  } finally {
                    setBusy(false);
                  }
                }}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition disabled:opacity-50',
                  index === 0
                    ? 'border-primary bg-primary text-primary-foreground hover:opacity-90'
                    : 'border-border bg-background hover:bg-foreground/[0.03]'
                )}
              >
                {option.label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <CornerDownRight size={12} /> or type your answer below
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
