import { CheckCircle2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { PromptBanner } from './prompt-banner';
import type { DbqState } from './use-dbq-state';

export function SubmittedView({ state }: { state: DbqState }) {
  const { prompt, essay, annotations, planning, setMode, resetTimer } = state;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} />
          <h2 className="text-base font-semibold">Submitted</h2>
        </div>
        <p className="mt-1 text-sm">
          In production this hands off to the GA for retrospective coaching
          (rubric panel, failure-mode flags, suggested edits). Prototype stops
          here.
        </p>
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetTimer();
              setMode('reading');
            }}
          >
            Reopen for revision
          </Button>
        </div>
      </div>

      <PromptBanner prompt={prompt} />

      <section className="rounded-lg border bg-background p-4">
        <h3 className="mb-2 text-sm font-semibold">Your essay</h3>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
          {essay || '(empty)'}
        </pre>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <h3 className="mb-2 text-sm font-semibold">Planning artifacts</h3>
          <dl className="space-y-2 text-xs">
            <Field label="Outline" value={planning.outline} />
            <Field label="Thesis draft" value={planning.thesisDraft} />
            <Field label="Doc groupings" value={planning.docGroupings} />
            <Field label="Outside evidence" value={planning.outsideEvidence} />
          </dl>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <h3 className="mb-2 text-sm font-semibold">Source annotations</h3>
          {annotations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No notes taken.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {annotations.map((a) => {
                const src = prompt.sources.find((s) => s.id === a.sourceId);
                return (
                  <li key={a.id} className="rounded-md bg-yellow-50 px-2 py-1">
                    <span className="font-semibold">Doc {src?.label}:</span>{' '}
                    {a.text}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap text-sm text-foreground/90">
        {value || <span className="text-muted-foreground">(empty)</span>}
      </dd>
    </div>
  );
}
