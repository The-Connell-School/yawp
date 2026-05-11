import { useState } from 'react';
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { CitedSources } from './cited-sources';
import { PlanningSidebar } from './planning-sidebar';
import type { DbqState } from './use-dbq-state';
import { cn } from '~/utils/misc';

export function EditorColumn({
  state,
  isMaximized,
  onToggleMaximize,
}: {
  state: DbqState;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}) {
  const { prompt, essay, setEssay, editorRef, insertCitation, planning, setPlanning } =
    state;
  const [planningOpen, setPlanningOpen] = useState(false);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <header className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Your essay</h2>
          <p className="text-[11px] text-muted-foreground">
            {wordCount(essay)} words
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPlanningOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            {planningOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            Planning
          </button>
          {onToggleMaximize ? (
            <button
              type="button"
              onClick={onToggleMaximize}
              aria-label={
                isMaximized
                  ? 'Restore split (50/50)'
                  : 'Write mode (expand editor)'
              }
              aria-pressed={isMaximized}
              title={isMaximized ? 'Restore split (50/50)' : 'Write mode'}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md border transition',
                isMaximized
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {isMaximized ? (
                <Minimize2 size={12} />
              ) : (
                <Maximize2 size={12} />
              )}
            </button>
          ) : null}
        </div>
      </header>

      {planningOpen ? (
        <div className="shrink-0 border-b p-3">
          <PlanningSidebar planning={planning} setPlanning={setPlanning} />
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/30 px-3 py-1.5">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Cite
        </span>
        {prompt.sources.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => insertCitation(s.label)}
            className="rounded-full border border-primary/40 bg-background px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            Doc {s.label}
          </button>
        ))}
        <span className="ml-1 text-[10px] text-muted-foreground">
          inserts at cursor
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <textarea
          ref={editorRef}
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
          placeholder={
            'Begin drafting. Use the toolbar above or click “Cite” on a source to drop [Doc X] tokens at the cursor.'
          }
          className={cn(
            'min-h-0 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring'
          )}
        />
        <CitedSources essay={essay} sources={prompt.sources} />
      </div>
    </section>
  );
}

function wordCount(s: string): number {
  const trimmed = s.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
