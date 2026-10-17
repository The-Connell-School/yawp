import { TEACHING_NOTES } from './data';

export function ThesisTeacherDirections({ enhanced = false }: { enhanced?: boolean }) {
  if (!enhanced) {
  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-2 text-base font-semibold">
        How the Thesis-Driven Essay library works
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Browse the prompts below, filter by category, subject, text, or grade
        band, and click any prompt to open the assignment sheet with its full
        text pre-filled. Pick a class, adjust the wording if you like, and hit
        Create Assignment — every student in that class gets the prompt as a
        formal, thesis-driven essay.
      </p>
      <p className="mb-3 text-sm text-muted-foreground">
        We&rsquo;ve found it works best to give students open-ended prompts that
        let them write about what interests them within a given text or topic.
        Very specific prompts can feel restrictive and tend to produce 75+
        essays on the same narrow question — the prompts below are written to
        leave room for students to find their own angle.
      </p>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Keep in mind
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {TEACHING_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
  }
  return (
    <section className={enhanced ? "mb-4 grid gap-5 rounded-xl border bg-card p-5 md:grid-cols-2" : "mb-6 rounded-lg border bg-muted/40 p-4"}>
      <div>
      <h3 className="mb-2 text-base font-semibold">
        How the Thesis-Driven Essay library works
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Browse the prompts below, filter by category, subject, text, or grade
        band, and click any prompt to open the assignment sheet with its full
        text pre-filled. Pick a class, adjust the wording if you like, and hit
        Create Assignment — every student in that class gets the prompt as a
        formal, thesis-driven essay.
      </p>
      <p className="mb-3 text-sm text-muted-foreground">
        We&rsquo;ve found it works best to give students open-ended prompts that
        let them write about what interests them within a given text or topic.
        Very specific prompts can feel restrictive and tend to produce 75+
        essays on the same narrow question — the prompts below are written to
        leave room for students to find their own angle.
      </p>
      </div>
      <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Keep in mind
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {TEACHING_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      </div>
    </section>
  );
}
