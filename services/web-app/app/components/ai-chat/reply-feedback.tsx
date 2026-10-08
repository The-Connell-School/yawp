/**
 * A teacher's verdict on one reply.
 *
 * A thumbs down is saved the moment it is tapped — a teacher between periods
 * will not fill in a form, and the tap alone is worth having. The note is an
 * offer after the fact: a few one-tap reasons, a line to type, and a way to
 * skip it.
 */
import { useState } from 'react';
import { useFetcher } from 'react-router';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '~/utils/misc';

type Rating = 'up' | 'down';

/** What goes wrong most often, as things to tap rather than type. */
export const FEEDBACK_REASONS = [
  'Too long',
  'Not right for my students',
  'Didn’t do what I asked',
  'Wrong facts or quotes',
  'Timing doesn’t add up',
] as const;

const FEEDBACK_ACTION = '/api/domain/lesson-planner/feedback';

export function ReplyFeedback({
  conversationId,
  messageId,
  initialRating,
  initialNote,
}: {
  conversationId: string;
  messageId: string;
  initialRating: Rating | null;
  initialNote: string | null;
}) {
  const fetcher = useFetcher();
  const [rating, setRating] = useState<Rating | null>(initialRating);
  const [note, setNote] = useState(initialNote ?? '');
  const [asking, setAsking] = useState(false);
  const [thanked, setThanked] = useState(false);

  function submit(next: Rating | null, withNote?: string) {
    fetcher.submit(
      {
        intent: 'rate',
        conversationId,
        messageId,
        rating: next ?? 'clear',
        ...(withNote ? { note: withNote } : {}),
      },
      { method: 'post', action: FEEDBACK_ACTION }
    );
  }

  function choose(next: Rating) {
    // Tapping the verdict already given takes it back.
    const value = rating === next ? null : next;
    setRating(value);
    setThanked(value === 'up');
    setAsking(value === 'down');
    if (value !== 'down') setNote('');
    submit(value);
  }

  function addReason(reason: string) {
    setNote((current) =>
      current.includes(reason)
        ? current
        : current.trim()
          ? `${current.trim()} ${reason}.`
          : `${reason}.`
    );
  }

  const thumbClass = (active: boolean) =>
    cn(
      'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground',
      active &&
        'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
    );

  return (
    <div className="flex w-full flex-col gap-2" data-testid="reply-feedback">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Helpful"
          aria-pressed={rating === 'up'}
          title="Helpful"
          onClick={() => choose('up')}
          className={thumbClass(rating === 'up')}
        >
          <ThumbsUp size={14} />
        </button>
        <button
          type="button"
          aria-label="Not helpful"
          aria-pressed={rating === 'down'}
          title="Not helpful"
          onClick={() => choose('down')}
          className={thumbClass(rating === 'down')}
        >
          <ThumbsDown size={14} />
        </button>
        {thanked ? (
          <span className="ml-1 text-xs text-muted-foreground">
            Thanks — that helps us improve the planner.
          </span>
        ) : null}
      </div>
      {asking ? (
        <form
          data-testid="reply-feedback-note"
          className="flex flex-col gap-2 rounded-xl border bg-background p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = note.trim();
            if (trimmed) submit('down', trimmed);
            setAsking(false);
            setThanked(true);
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => addReason(reason)}
                className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {reason}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            What was off? (optional)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={1000}
              className="rounded-md border bg-background px-2 py-1.5 text-sm font-normal text-foreground"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAsking(false);
                setThanked(true);
              }}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-foreground/5"
            >
              Skip
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Send
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
