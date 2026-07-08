import { Sparkles } from 'lucide-react';

import { Badge } from '~/components/ui/badge';

/**
 * Practice exercises sometimes arrive as a short lead-in plus the sentence to
 * work on, e.g. `Add a comma if needed: "Although he trained…"`. Pull the
 * lead-in out so the sentence itself can be the visual centerpiece, and strip
 * the wrapping quotes that would otherwise clutter a big, centered line.
 */
export function splitPracticeExercise(exercise: string): {
  leadIn: string | null;
  sentence: string;
} {
  const trimmed = exercise.trim();
  const colon = trimmed.indexOf(':');
  const stripQuotes = (value: string) =>
    value.replace(/^["“](.*)["”]$/s, '$1').trim() || value;

  if (colon > 0 && colon <= 40 && colon < trimmed.length - 1) {
    return {
      leadIn: trimmed.slice(0, colon + 1).trim(),
      sentence: stripQuotes(trimmed.slice(colon + 1).trim()),
    };
  }
  return { leadIn: null, sentence: stripQuotes(trimmed) };
}

export function PracticePrompt({
  exercise,
  instruction,
  skillLabel,
}: {
  exercise: string;
  instruction: string;
  skillLabel?: string;
}) {
  const { leadIn, sentence } = splitPracticeExercise(exercise);

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Rewrite this
        </p>
        {skillLabel ? (
          <Badge variant="outline" size="sm">
            {skillLabel}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-1.5 py-3 text-center">
        {leadIn ? (
          <p className="text-sm font-medium text-muted-foreground">{leadIn}</p>
        ) : null}
        <p className="mx-auto max-w-[46ch] text-balance text-xl font-semibold leading-snug text-foreground sm:text-2xl">
          {sentence}
        </p>
      </div>

      <p className="flex items-start justify-center gap-1.5 text-sm text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        {instruction}
      </p>
    </div>
  );
}
