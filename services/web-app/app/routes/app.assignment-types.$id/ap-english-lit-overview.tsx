import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import {
  AP_ENGLISH_LIT_RUBRIC,
  type ApEnglishLitRubricRow,
} from '~/domain/ap-english-lit/rubric';
import { cn } from '~/utils/misc';

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

function RubricRowDetail({ row }: { row: ApEnglishLitRubricRow }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h5 className="text-sm font-semibold">
          Row {row.label} · {row.title}
        </h5>
        <span className="shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-medium text-foreground">
          0–{row.maxPoints} {row.maxPoints === 1 ? 'point' : 'points'}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        {row.description}
      </p>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        What earns each score
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {row.levels.map((level) => (
          <li key={level.points} className="flex gap-2 text-xs leading-5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-semibold text-foreground">
              {level.points}
            </span>
            <span>
              <span className="font-medium">{level.summary}</span>
              <span className="text-muted-foreground">
                {' — '}
                {level.criteria.join(' ')}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Common pitfalls
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
        {row.commonFailures.map((failure) => (
          <li key={failure}>{failure}</li>
        ))}
      </ul>
    </div>
  );
}

export function ApEnglishLitOverview() {
  const [showRubricDetail, setShowRubricDetail] = useState(false);
  const detailId = useId();

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

      <div className="mt-3 rounded-lg border bg-muted/30">
        <button
          type="button"
          data-testid="ap-lit-rubric-toggle"
          aria-expanded={showRubricDetail}
          aria-controls={detailId}
          onClick={() => setShowRubricDetail((open) => !open)}
          className="flex w-full items-start justify-between gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scoring — {AP_ENGLISH_LIT_RUBRIC.totalPoints}-point analytic
              rubric
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
          <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs font-medium text-muted-foreground">
            <span className="hidden sm:inline">
              {showRubricDetail ? 'Hide details' : 'How it works'}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-200',
                showRubricDetail && 'rotate-180',
              )}
            />
          </span>
        </button>

        {showRubricDetail ? (
          <div id={detailId} className="border-t px-3 pb-3 pt-3">
            <h4 className="text-sm font-semibold">How scoring works</h4>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Every response — poetry, prose, or literary argument — is scored
              on the same three rows. Each row is judged on its own and the
              points add up to a total out of{' '}
              {AP_ENGLISH_LIT_RUBRIC.totalPoints}. The descriptors are
              behavioral: they describe what a reader looks for at each score
              point, not a vague sense of “good writing.” The coach’s feedback
              maps back to these rows, so students always know which move earns
              the next point.
            </p>

            <div className="mt-3 grid gap-3">
              {AP_ENGLISH_LIT_RUBRIC.rows.map((row) => (
                <RubricRowDetail key={row.rowId} row={row} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
