import { useMemo } from 'react';
import { AlertTriangle, Lightbulb, ChevronRight } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { DBQ_PHASES } from './types';
import type { DbqState } from './use-dbq-state';
import { detectFailureFlags, phaseHints, suggestNextPhase } from './coaching';
import { cn } from '~/utils/misc';

export function CoachPanel({
  state,
  collapsed,
  onToggle,
}: {
  state: DbqState;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { prompt, phase, setPhase, essay, planning } = state;

  const flags = useMemo(
    () => detectFailureFlags(essay, prompt),
    [essay, prompt]
  );
  const suggested = useMemo(
    () => suggestNextPhase(phase, essay, planning.thesisDraft),
    [phase, essay, planning.thesisDraft]
  );

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 flex-col items-center gap-2 rounded-lg border bg-background py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label="Open coach"
        >
          <ChevronRight size={16} className="rotate-180" />
        </Button>
        <Lightbulb size={18} className="text-muted-foreground" />
        {flags.length > 0 ? (
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground"
            title={`${flags.length} note${flags.length === 1 ? '' : 's'} from coach`}
          >
            {flags.length}
          </span>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Coach</h2>
          <p className="text-xs text-muted-foreground">
            Soft phase markers · failure-mode detectors
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse coach">
          <ChevronRight size={16} />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <section>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Phase
          </div>
          <ol className="space-y-1">
            {DBQ_PHASES.map((p, i) => {
              const active = p.id === phase;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPhase(p.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition hover:bg-muted/50',
                      active && 'bg-primary/10 font-medium text-primary'
                    )}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]">
                      {i + 1}
                    </span>
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ol>
          {suggested ? (
            <p className="mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-900">
              Looks like you might be ready for{' '}
              <button
                type="button"
                onClick={() => setPhase(suggested)}
                className="font-semibold underline"
              >
                {DBQ_PHASES.find((p) => p.id === suggested)?.label}
              </button>
              .
            </p>
          ) : null}
        </section>

        <section>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lightbulb size={12} /> Tip
          </div>
          <p className="rounded-md bg-muted/40 p-2 text-sm leading-relaxed">
            {phaseHints[phase]}
          </p>
        </section>

        <section>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle size={12} /> Watch for
          </div>
          {flags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No flagged patterns yet. The tutor is quiet — keep going.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {flags.map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs"
                >
                  <div className="mb-0.5 font-semibold text-amber-900">
                    {f.label}
                  </div>
                  <div className="text-amber-900/80">{f.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
