import { useState } from 'react';
import { cn } from '~/utils/misc';
import type { DbqSource } from './types';

export function DocRail({
  sources,
  onInsertCitation,
}: {
  sources: DbqSource[];
  onInsertCitation: (label: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <aside className="flex h-full flex-col rounded-lg border bg-background">
      <header className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Documents</h2>
        <p className="text-xs text-muted-foreground">
          Click to expand. Use “Cite” to drop a citation at the cursor.
        </p>
      </header>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {sources.map((s) => {
          const open = openId === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition hover:bg-muted/50',
                  open && 'bg-muted/60'
                )}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {s.label}
                </span>
                <span className="line-clamp-1 flex-1 text-xs">{s.title}</span>
              </button>
              {open ? (
                <div className="mt-1 rounded-md border bg-muted/30 p-2 text-xs">
                  <p className="mb-1 italic text-muted-foreground">
                    {s.attribution}
                  </p>
                  <p className="leading-relaxed text-foreground/90">
                    {s.body}
                  </p>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onInsertCitation(s.label)}
                      className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Cite [Doc {s.label}]
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
