import { useMemo } from 'react';
import { Tooltip } from '~/components/ui/tooltip';
import type { DbqSource } from './types';

export function CitedSources({
  essay,
  sources,
}: {
  essay: string;
  sources: DbqSource[];
}) {
  const cited = useMemo(() => {
    const labels = new Set(
      Array.from(essay.matchAll(/\[Doc ([A-G])\]/g)).map((m) => m[1])
    );
    return sources.filter((s) => labels.has(s.label));
  }, [essay, sources]);

  const uncited = sources.filter((s) => !cited.includes(s));

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Citations in your essay
        </h3>
        <span className="text-xs text-muted-foreground">
          {cited.length} of {sources.length}
        </span>
      </div>
      {cited.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents cited yet. Use the toolbar above the editor to drop a
          chip at the cursor.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {cited.map((s) => (
            <Tooltip
              key={s.id}
              delayDuration={150}
              text={
                <div className="max-w-xs">
                  <p className="mb-1 text-xs font-semibold">{s.title}</p>
                  <p className="mb-1 text-[11px] italic opacity-80">
                    {s.attribution}
                  </p>
                  <p className="line-clamp-4 text-xs leading-snug">{s.body}</p>
                </div>
              }
            >
              <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Doc {s.label}
              </span>
            </Tooltip>
          ))}
        </div>
      )}
      {uncited.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Not yet cited: {uncited.map((s) => s.label).join(', ')}.
        </p>
      ) : null}
    </div>
  );
}
