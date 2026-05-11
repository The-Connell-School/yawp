import { SourceCard } from './source-card';
import type { DbqState } from './use-dbq-state';

export function SourcesColumn({ state }: { state: DbqState }) {
  const { prompt, annotations, addAnnotation, removeAnnotation, insertCitation } =
    state;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <header className="shrink-0 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Documents</h2>
        <p className="text-[11px] text-muted-foreground">
          Cite to drop a chip in the editor. Add a note to capture HIPP
          observations.
        </p>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {prompt.sources.map((s) => (
          <SourceCard
            key={s.id}
            source={s}
            annotations={annotations.filter((a) => a.sourceId === s.id)}
            onAddAnnotation={addAnnotation}
            onRemoveAnnotation={removeAnnotation}
            onInsertCitation={insertCitation}
          />
        ))}
      </div>
    </section>
  );
}
