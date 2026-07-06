import { useEffect, useMemo, useState } from 'react';
import { BookOpen, MessageSquarePlus, Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { DbqSource, SourceAnnotation } from './types';
import type { DbqState } from './use-dbq-state';
import { cn } from '~/utils/misc';

export function SourcesColumn({
  state,
  isMaximized,
  onToggleMaximize,
}: {
  state: DbqState;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}) {
  const { prompt, annotations, addAnnotation, removeAnnotation, insertCitation } =
    state;
  const [selectedId, setSelectedId] = useState(prompt.sources[0]?.id ?? '');

  const active =
    prompt.sources.find((s) => s.id === selectedId) ?? prompt.sources[0];
  const activeAnnotations = annotations.filter((a) => a.sourceId === active.id);

  const annotationCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of annotations) {
      m.set(a.sourceId, (m.get(a.sourceId) ?? 0) + 1);
    }
    return m;
  }, [annotations]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <header className="shrink-0 border-b">
        <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
          <h2 className="text-sm font-semibold">Documents</h2>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {prompt.sources.length} sources · click a thumbnail
            </span>
            {onToggleMaximize ? (
              <button
                type="button"
                onClick={onToggleMaximize}
                aria-label={
                  isMaximized
                    ? 'Exit Read mode (restore 50/50)'
                    : 'Read mode (expand sources)'
                }
                aria-pressed={isMaximized}
                title={isMaximized ? 'Exit Read mode' : 'Read mode'}
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-md border transition',
                  isMaximized
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary'
                )}
              >
                <BookOpen size={12} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto px-2 pb-2">
          {prompt.sources.map((s) => {
            const isActive = s.id === active.id;
            const count = annotationCounts.get(s.id) ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                title={s.title}
                className={cn(
                  'group relative inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                    isActive
                      ? 'bg-primary-foreground text-primary'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {s.label}
                </span>
                <span className="hidden max-w-[110px] truncate font-normal lg:inline">
                  {shortTitle(s.title)}
                </span>
                {count > 0 ? (
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-semibold',
                      isActive
                        ? 'bg-primary-foreground/90 text-primary'
                        : 'bg-yellow-200 text-yellow-900'
                    )}
                    aria-label={`${count} note${count === 1 ? '' : 's'}`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </header>

      <ActiveSourceViewer
        source={active}
        annotations={activeAnnotations}
        onAddAnnotation={addAnnotation}
        onRemoveAnnotation={removeAnnotation}
        onInsertCitation={insertCitation}
      />
    </section>
  );
}

function ActiveSourceViewer({
  source,
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  onInsertCitation,
}: {
  source: DbqSource;
  annotations: SourceAnnotation[];
  onAddAnnotation: (sourceId: string, text: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onInsertCitation: (label: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setAdding(false);
    setDraft('');
  }, [source.id]);

  function commit() {
    onAddAnnotation(source.id, draft);
    setDraft('');
    setAdding(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {source.label}
              </span>
              <h3 className="truncate text-sm font-semibold">{source.title}</h3>
            </div>
            <p className="mt-1 text-[11px] italic text-muted-foreground">
              {source.attribution}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onInsertCitation(source.label)}
            >
              Cite [Doc {source.label}]
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setAdding((v) => !v)}
            >
              <MessageSquarePlus size={13} className="mr-1" />
              Note
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/90">
          {source.body}
        </p>
        {source.caption ? (
          <p className="mt-3 rounded-md bg-muted/30 px-2 py-1.5 text-[11px] italic text-muted-foreground">
            {source.caption}
          </p>
        ) : null}

        {adding ? (
          <div className="mt-4 rounded-md border bg-muted/30 p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Note point of view, audience, purpose, or context."
              className="min-h-[64px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  setAdding(false);
                  setDraft('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={commit}
                disabled={!draft.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}

        {annotations.length > 0 ? (
          <div className="mt-4">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Your notes on this document
            </h4>
            <ul className="space-y-1">
              {annotations.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-2 rounded-md bg-yellow-50 px-2 py-1.5 text-[12px] text-yellow-900"
                >
                  <span>{a.text}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAnnotation(a.id)}
                    className="text-yellow-700 hover:text-yellow-900"
                    aria-label="Remove note"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function shortTitle(title: string): string {
  const after = title.replace(/^(Petition of|Testimony of|Address of)\s+/i, '');
  return after.replace(/^.*?[—:]\s*/, '').slice(0, 60);
}
