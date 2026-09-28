import { PenLine, Sparkles } from 'lucide-react';

/**
 * Many composition prompts are a short scenario that ends with a quoted example
 * to work on, e.g. `Here's a fence-sitting thesis: "Social media has both…"`.
 * Pull the quote out so it can be showcased as a blockquote instead of sitting
 * flat inside a sentence. Returns nulls when there is no trailing quote.
 */
export function splitQuotedExample(exercise: string): {
  lead: string | null;
  quote: string | null;
} {
  const match = exercise.trim().match(/^(.*?)\s*["“]([^"“”]+)["”][.]?\s*$/s);
  if (match && match[2]) {
    const lead = match[1].trim();
    return { lead: lead.length > 0 ? lead : null, quote: match[2].trim() };
  }
  return { lead: null, quote: null };
}

/**
 * The constructed-response prompt shown in composition practice: a "scenario"
 * panel (with any quoted example set off as a blockquote) and an accented
 * "your task" callout so the actual instruction reads as a call to action
 * rather than another line of gray text.
 */
export function CompositionPrompt({
  exercise,
  instruction,
}: {
  exercise: string;
  instruction: string;
}) {
  const { lead, quote } = splitQuotedExample(exercise);

  return (
    <div
      data-testid="composition-prompt"
      className="overflow-hidden rounded-2xl border border-border/70 bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/50 px-4 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          The scenario
        </p>
      </div>

      <div className="space-y-3 px-4 py-4">
        {quote ? (
          <>
            {lead ? (
              <p className="text-base leading-relaxed text-foreground">
                {lead}
              </p>
            ) : null}
            <blockquote className="border-l-4 border-primary/40 bg-primary/5 px-4 py-2.5 text-base italic leading-relaxed text-foreground">
              “{quote}”
            </blockquote>
          </>
        ) : (
          <p className="text-base leading-relaxed text-foreground">
            {exercise}
          </p>
        )}

        <div className="flex gap-2.5 rounded-xl bg-primary/5 p-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <PenLine className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Your task
            </p>
            <p className="mt-0.5 text-base font-medium leading-relaxed text-foreground">
              {instruction}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
