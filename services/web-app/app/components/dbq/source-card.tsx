import { useState } from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { DbqSource, SourceAnnotation } from './types';

export function SourceCard({
  source,
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  readOnly = false,
}: {
  source: DbqSource;
  annotations: SourceAnnotation[];
  onAddAnnotation: (sourceId: string, text: string) => void;
  onRemoveAnnotation: (id: string) => void;
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
    <article className="rounded-lg border bg-background p-4">
      <header className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {source.label}
            </span>
            <h3 className="font-medium">{source.title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {source.attribution}
          </p>
        </div>
        {!readOnly ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding((v) => !v)}
          >
            <MessageSquarePlus size={14} className="mr-1.5" />
            Annotate
          </Button>
        ) : null}
      </header>

      <p className="text-sm leading-relaxed text-foreground/90">
        {source.body}
      </p>
      {source.caption ? (
        <p className="mt-2 text-xs italic text-muted-foreground">
          {source.caption}
        </p>
      ) : null}

      {adding ? (
        <div className="mt-3 rounded-md border bg-muted/30 p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What does this source tell you? Note point of view, audience, purpose, or context."
            className="min-h-[64px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setDraft('');
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={commit} disabled={!draft.trim()}>
              Save note
            </Button>
          </div>
        </div>
      ) : null}

      {annotations.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {annotations.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-2 rounded-md bg-yellow-50 px-2.5 py-1.5 text-sm text-yellow-900"
            >
              <span>{a.text}</span>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => onRemoveAnnotation(a.id)}
                  className="text-yellow-700 hover:text-yellow-900"
                  aria-label="Remove note"
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
