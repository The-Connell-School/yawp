import { Lock } from 'lucide-react';
import { PlanningSidebar } from './planning-sidebar';
import { PromptBanner } from './prompt-banner';
import { SourceCard } from './source-card';
import type { DbqState } from './use-dbq-state';

export function ReadingMode({ state }: { state: DbqState }) {
  const {
    prompt,
    annotations,
    addAnnotation,
    removeAnnotation,
    planning,
    setPlanning,
    timeMode,
  } = state;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_360px]">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <PromptBanner prompt={prompt} />
        {timeMode === 'timed' ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Lock size={14} />
            Reading phase: the editor is locked. Annotate sources and use the
            planning sidebar. The tutor is silent unless asked.
          </div>
        ) : null}
        <div className="space-y-3">
          {prompt.sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              annotations={annotations.filter((a) => a.sourceId === s.id)}
              onAddAnnotation={addAnnotation}
              onRemoveAnnotation={removeAnnotation}
            />
          ))}
        </div>
      </div>
      <div className="min-h-0">
        <PlanningSidebar planning={planning} setPlanning={setPlanning} />
      </div>
    </div>
  );
}
