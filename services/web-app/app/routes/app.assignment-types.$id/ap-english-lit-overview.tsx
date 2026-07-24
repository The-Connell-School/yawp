import { AP_ENGLISH_LIT_RUBRIC } from '~/domain/ap-english-lit/rubric';

const QUESTION_TYPES: Array<{ tag: string; title: string; blurb: string }> = [
  {
    tag: 'Q1',
    title: 'Poetry Analysis',
    blurb:
      'Students analyze a provided poem — how the poet’s choices create meaning.',
  },
  {
    tag: 'Q2',
    title: 'Prose Fiction Analysis',
    blurb:
      'Students analyze a provided prose or drama passage — characterization, tone, structure.',
  },
  {
    tag: 'Q3',
    title: 'Literary Argument',
    blurb:
      'The open question — students argue an interpretation of a work of literary merit they choose.',
  },
];

export function ApEnglishLitOverview() {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-foreground/75">About this course</h3>
      <div className="border-b" />
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Pick a prompt from the library below to assign a timed AP Literature
        free-response essay. As students draft, the AP Literature coach gives
        rubric-anchored feedback — it asks questions and points to the next
        move rather than writing for them. Submissions are scored on the
        official 6-point analytic rubric.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {QUESTION_TYPES.map((q) => (
          <div key={q.tag} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-semibold text-foreground">
                {q.tag}
              </span>
              <h4 className="text-sm font-semibold">{q.title}</h4>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {q.blurb}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Scoring — {AP_ENGLISH_LIT_RUBRIC.totalPoints}-point analytic rubric
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {AP_ENGLISH_LIT_RUBRIC.rows.map((row) => (
            <li key={row.rowId} className="text-xs leading-5">
              <span className="font-semibold">
                Row {row.label} · {row.title}
              </span>{' '}
              <span className="text-muted-foreground">
                (0–{row.maxPoints})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
