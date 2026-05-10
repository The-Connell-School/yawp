import { useState } from 'react';
import { ChevronLeft, NotebookPen } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { CitedSources } from './cited-sources';
import { CoachPanel } from './coach-panel';
import { DocRail } from './doc-rail';
import { PlanningSidebar } from './planning-sidebar';
import { PromptBanner } from './prompt-banner';
import type { DbqState } from './use-dbq-state';
import { cn } from '~/utils/misc';

export function WritingMode({ state }: { state: DbqState }) {
  const { prompt, essay, setEssay, editorRef, insertCitation, planning, setPlanning } =
    state;
  const [coachCollapsed, setCoachCollapsed] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);

  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 gap-4 p-4',
        coachCollapsed
          ? 'grid-cols-[240px_1fr_60px]'
          : 'grid-cols-[240px_1fr_320px]'
      )}
    >
      <div className="min-h-0">
        <DocRail sources={prompt.sources} onInsertCitation={insertCitation} />
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <PromptBanner prompt={prompt} />

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {wordCount(essay)} words
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPlanningOpen((v) => !v)}
          >
            <NotebookPen size={14} className="mr-1.5" />
            {planningOpen ? 'Hide planning' : 'Open planning'}
          </Button>
        </div>

        {planningOpen ? (
          <div className="h-64">
            <PlanningSidebar planning={planning} setPlanning={setPlanning} />
          </div>
        ) : null}

        <CitationToolbar
          labels={prompt.sources.map((s) => s.label)}
          onInsert={insertCitation}
        />

        <textarea
          ref={editorRef}
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
          placeholder="Begin drafting. Use the doc rail or the toolbar above to drop [Doc X] citations as you cite."
          className="min-h-[360px] flex-1 resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <CitedSources essay={essay} sources={prompt.sources} />
      </div>

      <div className="min-h-0">
        <CoachPanel
          state={state}
          collapsed={coachCollapsed}
          onToggle={() => setCoachCollapsed((v) => !v)}
        />
      </div>
    </div>
  );
}

function CitationToolbar({
  labels,
  onInsert,
}: {
  labels: string[];
  onInsert: (label: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5">
      <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">
        Cite
      </span>
      {labels.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onInsert(l)}
          className="rounded-full border border-primary/40 bg-background px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          Doc {l}
        </button>
      ))}
      <ChevronLeft size={12} className="ml-1 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground">
        Inserts at cursor
      </span>
    </div>
  );
}

function wordCount(s: string): number {
  const trimmed = s.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
