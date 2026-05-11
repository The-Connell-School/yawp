import { useState } from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { DbqSource, SourceAnnotation } from './types';
import { cn } from '~/utils/misc';

export function SourceCard({
  source,
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  onInsertCitation,
  readOnly = false,
}: {
  source: DbqSource;
  annotations: SourceAnnotation[];
  onAddAnnotation: (sourceId: string, text: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onInsertCitation?: (label: string) => void;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  function commit() {
    onAddAnnotation(source.id, draft);
    setDraft('');
    setAdding(false);
  }

  return (
    <article className="rounded-lg border bg-background p-3">
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {source.label}
            </span>
            <h3 className="truncate text-sm font-medium">{source.title}</h3>
          </div>
          <p className="mt-1 text-[11px] italic text-muted-foreground">
            {source.attribution}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onInsertCitation ? (
            <Button
              variant="outline"
              size="sm"
              className={cn('h-7 px-2 text-[11px]')}
              onClick={() => onInsertCitation(source.label)}
              disabled={readOnly}
            >
              Cite
            </Button>
          ) : null}
          {!readOnly ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setAdding((v) => !v)}
            >
              <MessageSquarePlus size={13} className="mr-1" />
              Note
            </Button>
          ) : null}
        </div>
      </header>

      <p className="text-[13px] leading-relaxed text-foreground/90">
        {source.body}
      </p>
      {source.caption ? (
        <p className="mt-1.5 text-[11px] italic text-muted-foreground">
          {source.caption}
        </p>
      ) : null}

      {adding ? (
        <div className="mt-2 rounded-md border bg-muted/30 p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Note point of view, audience, purpose, or context."
            className="min-h-[56px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring"
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
        <ul className="mt-2 space-y-1">
          {annotations.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-2 rounded-md bg-yellow-50 px-2 py-1 text-[12px] text-yellow-900"
            >
              <span>{a.text}</span>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => onRemoveAnnotation(a.id)}
                  className="text-yellow-700 hover:text-yellow-900"
                  aria-label="Remove note"
                >
                  <Trash2 size={12} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
