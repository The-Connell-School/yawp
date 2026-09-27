import { MessageSquareText } from 'lucide-react';

import {
  practiceFeedbackStatusLabel,
  type PracticeFeedbackResult,
} from '~/utils/writing-lessons/practice-feedback.shared';

/**
 * Tutor feedback on a piece of student writing — a composition draft or a
 * grammar rewrite. Shared by every practice surface so feedback reads the same
 * whether the student is working an assigned set or practising on their own.
 */
export function PracticeFeedbackPanel({
  feedback,
  testId = 'composition-result',
}: {
  feedback: PracticeFeedbackResult;
  testId?: string;
}) {
  // Degraded feedback is not a verdict — the deterministic fallback never
  // evaluated correctness. Render it neutrally so it cannot be mistaken for a
  // pass, whatever status it carries.
  const tone = feedback.degraded
    ? 'border-border bg-muted/40'
    : feedback.status === 'strong'
      ? 'border-emerald-300 bg-emerald-50'
      : feedback.status === 'developing'
        ? 'border-amber-300 bg-amber-50'
        : 'border-rose-300 bg-rose-50';

  return (
    <div
      data-testid={testId}
      className={`space-y-3 rounded-xl border p-4 ${tone}`}
    >
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-foreground" />
        <span className="text-sm font-semibold text-foreground">
          {feedback.degraded
            ? 'Not checked yet'
            : practiceFeedbackStatusLabel(feedback.status)}
        </span>
        {feedback.degraded ? (
          <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
            Tutor offline — correctness not checked
          </span>
        ) : null}
      </div>

      <p className="text-sm leading-relaxed text-foreground">
        {feedback.summary}
      </p>

      {feedback.strengths.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What&rsquo;s working
          </p>
          <ul className="ml-1 space-y-1 border-l-2 border-border pl-3 text-sm text-foreground">
            {feedback.strengths.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.focus.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Try next
          </p>
          <ul className="ml-1 space-y-1 border-l-2 border-border pl-3 text-sm text-foreground">
            {feedback.focus.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-sm font-medium italic text-muted-foreground">
        {feedback.encouragement}
      </p>
    </div>
  );
}
