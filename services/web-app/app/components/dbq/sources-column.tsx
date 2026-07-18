import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Highlighter,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Trash2,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { SourceBody, type SelectRange } from './source-body';
import type { DbqSource, MarkKind, SourceAnnotation, TextMark } from './types';
import type { DbqState } from './use-dbq-state';
import { cn } from '~/utils/misc';

export function SourcesColumn({
  state,
  isMaximized,
  onToggleMaximize,
  allowSourceTools = true,
  className,
}: {
  state: DbqState;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  allowSourceTools?: boolean;
  className?: string;
}) {
  const {
    prompt,
    annotations,
    addAnnotation,
    removeAnnotation,
    marks,
    addMark,
    setMarkNote,
    removeMark,
    insertCitation,
  } = state;
  const [selectedId, setSelectedId] = useState(prompt.sources[0]?.id ?? '');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsFullscreen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const active =
    prompt.sources.find((s) => s.id === selectedId) ?? prompt.sources[0];
  const activeAnnotations = annotations.filter((a) => a.sourceId === active.id);
  const activeMarks = marks.filter((m) => m.sourceId === active.id);

  const annotationCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of annotations) {
      m.set(a.sourceId, (m.get(a.sourceId) ?? 0) + 1);
    }
    for (const mark of marks) {
      m.set(mark.sourceId, (m.get(mark.sourceId) ?? 0) + 1);
    }
    return m;
  }, [annotations, marks]);

  return (
    <section
      role={isFullscreen ? 'dialog' : undefined}
      aria-modal={isFullscreen ? 'true' : undefined}
      aria-label={isFullscreen ? 'Documents full screen' : undefined}
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background',
        className,
        isFullscreen && 'fixed inset-0 z-50 h-auto rounded-none border-0'
      )}
    >
      <header className="shrink-0 border-b">
        <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
          <h2 className="text-sm font-semibold">Documents</h2>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {prompt.sources.length} sources · click a thumbnail
            </span>
            {onToggleMaximize && !isFullscreen ? (
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
            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-label={
                isFullscreen
                  ? 'Exit full screen'
                  : 'Full screen (expand documents)'
              }
              aria-pressed={isFullscreen}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md border transition',
                isFullscreen
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary'
              )}
            >
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
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
        marks={activeMarks}
        onAddMark={addMark}
        onSetMarkNote={setMarkNote}
        onRemoveMark={removeMark}
        onInsertCitation={insertCitation}
        allowSourceTools={allowSourceTools}
        isFullscreen={isFullscreen}
      />
    </section>
  );
}

function ActiveSourceViewer({
  source,
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  marks,
  onAddMark,
  onSetMarkNote,
  onRemoveMark,
  onInsertCitation,
  allowSourceTools,
  isFullscreen = false,
}: {
  source: DbqSource;
  annotations: SourceAnnotation[];
  onAddAnnotation: (sourceId: string, text: string) => void;
  onRemoveAnnotation: (id: string) => void;
  marks: TextMark[];
  onAddMark: (
    sourceId: string,
    kind: MarkKind,
    start: number,
    end: number,
    quote: string
  ) => string;
  onSetMarkNote: (id: string, note: string) => void;
  onRemoveMark: (id: string) => void;
  onInsertCitation: (label: string) => void;
  allowSourceTools: boolean;
  isFullscreen?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<SelectRange | null>(null);
  const [commentingMarkId, setCommentingMarkId] = useState<string | null>(null);
  const [activeMarkId, setActiveMarkId] = useState<string | null>(null);

  useEffect(() => {
    setAdding(false);
    setDraft('');
    setPending(null);
    setCommentingMarkId(null);
    setActiveMarkId(null);
  }, [source.id]);

  function commit() {
    onAddAnnotation(source.id, draft);
    setDraft('');
    setAdding(false);
  }

  function applyMark(kind: MarkKind) {
    if (!pending) return;
    const id = onAddMark(
      source.id,
      kind,
      pending.start,
      pending.end,
      pending.quote
    );
    setPending(null);
    setActiveMarkId(id);
    return id;
  }

  function startComment() {
    const id = applyMark('highlight');
    if (id) setCommentingMarkId(id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <div
          className={cn(
            'flex items-start justify-between gap-3',
            isFullscreen && 'mx-auto w-full max-w-3xl'
          )}
        >
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
          {allowSourceTools ? (
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
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className={cn(isFullscreen && 'mx-auto max-w-3xl')}>
          {pending ? (
            <SelectionToolbar
              quote={pending.quote}
              onHighlight={() => applyMark('highlight')}
              onUnderline={() => applyMark('underline')}
              onComment={startComment}
              onCancel={() => setPending(null)}
            />
          ) : (
            <p className="mb-2 text-[11px] text-muted-foreground">
              Select text in the document to highlight, underline, or comment.
            </p>
          )}

          {source.imageUrl ? (
            <img
              src={source.imageUrl}
              alt={source.imageAlt ?? source.title}
              loading="lazy"
              className="mb-3 w-full rounded-md border bg-slate-50 object-contain"
            />
          ) : null}

          <SourceBody
            body={source.body}
            marks={marks}
            onSelect={setPending}
            activeMarkId={activeMarkId}
            onClickMark={(id) => {
              setActiveMarkId(id);
              setCommentingMarkId(id);
            }}
          />

          {source.caption ? (
            <p className="mt-3 rounded-md bg-muted/30 px-2 py-1.5 text-[11px] italic text-muted-foreground">
              {source.caption}
            </p>
          ) : null}

          {allowSourceTools && adding ? (
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

          <MarksList
            marks={marks}
            commentingMarkId={commentingMarkId}
            onStartComment={(id) => {
              setActiveMarkId(id);
              setCommentingMarkId(id);
            }}
            onSaveComment={(id, note) => {
              onSetMarkNote(id, note);
              setCommentingMarkId(null);
            }}
            onCancelComment={() => setCommentingMarkId(null)}
            onFocusMark={setActiveMarkId}
            onRemove={(id) => {
              if (commentingMarkId === id) setCommentingMarkId(null);
              if (activeMarkId === id) setActiveMarkId(null);
              onRemoveMark(id);
            }}
          />

          {allowSourceTools && annotations.length > 0 ? (
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
    </div>
  );
}

function SelectionToolbar({
  quote,
  onHighlight,
  onUnderline,
  onComment,
  onCancel,
}: {
  quote: string;
  onHighlight: () => void;
  onUnderline: () => void;
  onComment: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Annotate selection"
      className="sticky top-0 z-10 mb-3 flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur"
    >
      <span className="mx-1 hidden max-w-[140px] truncate text-[11px] italic text-muted-foreground sm:inline">
        “{quote}”
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px]"
        aria-label="Highlight selection"
        onClick={onHighlight}
      >
        <Highlighter size={13} className="mr-1" />
        Highlight
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px]"
        aria-label="Underline selection"
        onClick={onUnderline}
      >
        <UnderlineIcon size={13} className="mr-1" />
        Underline
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px]"
        aria-label="Comment on selection"
        onClick={onComment}
      >
        <MessageSquarePlus size={13} className="mr-1" />
        Comment
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 px-2 text-[11px] text-muted-foreground"
        aria-label="Cancel selection"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

function MarksList({
  marks,
  commentingMarkId,
  onStartComment,
  onSaveComment,
  onCancelComment,
  onFocusMark,
  onRemove,
}: {
  marks: TextMark[];
  commentingMarkId: string | null;
  onStartComment: (id: string) => void;
  onSaveComment: (id: string, note: string) => void;
  onCancelComment: () => void;
  onFocusMark: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (marks.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Annotations
      </h4>
      <ul className="space-y-1.5">
        {marks.map((mark) => (
          <MarkRow
            key={mark.id}
            mark={mark}
            isCommenting={commentingMarkId === mark.id}
            onStartComment={() => onStartComment(mark.id)}
            onSaveComment={(note) => onSaveComment(mark.id, note)}
            onCancelComment={onCancelComment}
            onFocus={() => onFocusMark(mark.id)}
            onRemove={() => onRemove(mark.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function MarkRow({
  mark,
  isCommenting,
  onStartComment,
  onSaveComment,
  onCancelComment,
  onFocus,
  onRemove,
}: {
  mark: TextMark;
  isCommenting: boolean;
  onStartComment: () => void;
  onSaveComment: (note: string) => void;
  onCancelComment: () => void;
  onFocus: () => void;
  onRemove: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <li className="rounded-md border bg-muted/20 px-2 py-1.5 text-[12px]">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onFocus}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-1.5">
            {mark.kind === 'highlight' ? (
              <Highlighter size={11} className="shrink-0 text-yellow-600" />
            ) : (
              <UnderlineIcon size={11} className="shrink-0 text-primary" />
            )}
            <span className="truncate italic text-muted-foreground">
              “{mark.quote}”
            </span>
          </span>
          {mark.note ? (
            <span className="mt-0.5 block text-foreground">{mark.note}</span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove annotation"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {isCommenting ? (
        <div className="mt-1.5">
          <textarea
            ref={textareaRef}
            defaultValue={mark.note}
            placeholder="Add a comment on this passage."
            className="min-h-[52px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onCancelComment}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              aria-label="Save comment"
              onClick={() =>
                onSaveComment((textareaRef.current?.value ?? '').trim())
              }
            >
              Save
            </Button>
          </div>
        </div>
      ) : !mark.note ? (
        <button
          type="button"
          onClick={onStartComment}
          className="mt-1 text-[11px] text-primary hover:underline"
        >
          Add comment
        </button>
      ) : null}
    </li>
  );
}

function shortTitle(title: string): string {
  const after = title.replace(/^(Petition of|Testimony of|Address of)\s+/i, '');
  return after.replace(/^.*?[—:]\s*/, '').slice(0, 60);
}
