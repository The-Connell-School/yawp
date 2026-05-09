import { INSPIRATIONAL_EXAMPLES } from './data';

export function TeacherDirections() {
  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-2 text-base font-semibold">How Daily Pages works</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Write a prompt, hit New → Assignment, and every student in the class
        gets a blank document pre-titled with your prompt. Daily Pages is
        effort-based: Tutor and Teacher feedback focuses on ideas rather than
        rubric scores or correctness.
      </p>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        For inspiration
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {INSPIRATIONAL_EXAMPLES.map((example) => (
          <li key={example}>{example}</li>
        ))}
      </ul>
    </section>
  );
}
