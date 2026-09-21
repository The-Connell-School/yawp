import {
  KIND_DESCRIPTION,
  KIND_LABEL,
  KIND_ORDER,
  TEACHING_NOTES,
} from './data';

export const SHORT_FORM_LIBRARY_HEADING = 'How the Daily Pages library works';

/**
 * How to use the library, and only that. What Daily Pages is, how it is
 * graded, and how to write a prompt live in `../about-daily-pages/`, which
 * renders this as its last section.
 *
 * It carries no heading or card of its own: it is a panel inside that
 * accordion, and the accordion's trigger is its heading.
 */
export function ShortFormTeacherDirections() {
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Browse the prompts below, filter by whether they need a source text, by
        kind, or by length, and click any prompt to open the assignment sheet
        with its text pre-filled. Adjust the wording if you like, pick a class,
        and hit Create Assignment.
      </p>
      <p className="mb-3 text-sm text-muted-foreground">
        Every prompt here is built to the shape described above: it asks for the
        backing as well as the opinion, and it names a finish line. Editing one
        is expected — keep those two parts and it will still grade.
      </p>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        The six kinds
      </p>
      <dl className="mb-4 space-y-1.5 text-sm text-foreground/80">
        {KIND_ORDER.map((kind) => (
          <div key={kind} className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="shrink-0 font-medium sm:w-[190px]">
              {KIND_LABEL[kind]}
            </dt>
            <dd className="text-muted-foreground">{KIND_DESCRIPTION[kind]}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Keep in mind
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        {TEACHING_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </>
  );
}
