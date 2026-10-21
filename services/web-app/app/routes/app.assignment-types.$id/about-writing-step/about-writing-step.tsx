import { scoringLine, type WritingStepCopy } from './content';

/**
 * What a teacher reads on the Prewriting or Thesis Statement page before
 * assigning it: what the step is, how a class runs it, and how it is scored.
 * The longer walk-through is behind "See how it works" in the header.
 */
export function AboutWritingStep({ copy }: { copy: WritingStepCopy }) {
  return (
    <section
      aria-labelledby="about-writing-step-heading"
      data-tour="type-directions"
      className="mb-6 rounded-lg border bg-muted/40 p-4"
    >
      <h2 id="about-writing-step-heading" className="text-base font-semibold">
        About {copy.title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{copy.lede}</p>
      <ol className="mt-3 space-y-2 text-sm">
        {copy.steps.map((step, i) => (
          <li key={step.title} className="flex gap-2">
            <span className="tabular-nums text-muted-foreground">{i + 1}</span>
            <span>
              <span className="font-medium">{step.title}.</span>{' '}
              <span className="text-muted-foreground">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground/80">
          {scoringLine(copy.rubric)}
        </span>{' '}
        {copy.scoringNote}
      </p>
    </section>
  );
}
