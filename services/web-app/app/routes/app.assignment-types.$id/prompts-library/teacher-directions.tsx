import { INSPIRATIONAL_EXAMPLES } from './data';
import type { OpenEndedPromptLibraryVariant } from './library-variant';

// Only the two variants that read this folder's freewrite corpus. Graded Daily
// Pages has its own library and its own directions.
const COPY: Record<
  OpenEndedPromptLibraryVariant,
  { heading: string; body: string; examplesLabel: string }
> = {
  'class-starter': {
    heading: 'How Class Starter works',
    body: 'Write a prompt, hit New → Assignment, and every student in the class gets a blank document pre-titled with your prompt. Class Starter is effort-based: the grading assistant checks that the student wrote and reflected, and Tutor and Teacher feedback focuses on ideas rather than rubric scores or correctness.',
    examplesLabel: 'For inspiration',
  },
  // Unchanged from before the split, and what a Daily Pages type keeps showing
  // until the split is turned on.
  'daily-pages-legacy': {
    heading: 'How Daily Pages works',
    body: 'Write a prompt, hit New → Assignment, and every student in the class gets a blank document pre-titled with your prompt. Daily Pages is effort-based: Tutor and Teacher feedback focuses on ideas rather than rubric scores or correctness.',
    examplesLabel: 'For inspiration',
  },
};

export function TeacherDirections({
  variant = 'daily-pages-legacy',
}: {
  variant?: OpenEndedPromptLibraryVariant;
}) {
  const copy = COPY[variant];

  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-2 text-base font-semibold">{copy.heading}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{copy.body}</p>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {copy.examplesLabel}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {INSPIRATIONAL_EXAMPLES.map((example) => (
          <li key={example}>{example}</li>
        ))}
      </ul>
    </section>
  );
}
