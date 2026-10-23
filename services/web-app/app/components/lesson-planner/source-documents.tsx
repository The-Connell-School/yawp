/**
 * The teacher's own documents in the planner chat (Oct 21): a paperclip to
 * add one, and a chip for each with a way to take it back out. Added before
 * a lesson's first message, they wait in this tab and go with that message.
 */
import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { cn } from '~/utils/misc';

export type SourceChip = { id: string; name: string; truncated: boolean };

const ACCEPT = '.pdf,.docx,.pptx,.txt,.md';
const API = '/api/domain/lesson-planner/uploads';

export function useSourceDocuments({
  conversationId,
  saved,
  enabled,
}: {
  conversationId: string | null;
  /** This lesson's documents, from the loader. */
  saved: SourceChip[];
  enabled: boolean;
}) {
  const [added, setAdded] = useState<SourceChip[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different lesson starts from its own documents.
  useEffect(() => {
    setAdded([]);
    setRemoved(new Set());
    setError(null);
  }, [conversationId]);

  const savedIds = new Set(saved.map((doc) => doc.id));
  const docs = [...saved, ...added.filter((doc) => !savedIds.has(doc.id))].filter((doc) => !removed.has(doc.id));

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('intent', 'upload');
      form.set('file', file);
      if (conversationId) form.set('conversationId', conversationId);
      const response = await fetch(API, { method: 'POST', body: form });
      const body = (await response.json().catch(() => ({}))) as { error?: string; upload?: SourceChip };
      if (!response.ok || !body.upload) throw new Error(body.error ?? 'That file could not be added.');
      setAdded((current) => [...current, body.upload!]);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setRemoved((current) => new Set(current).add(id));
    const form = new FormData();
    form.set('intent', 'remove');
    form.set('uploadId', id);
    await fetch(API, { method: 'POST', body: form }).catch(() => undefined);
  }

  return {
    enabled,
    docs,
    busy,
    error,
    upload,
    remove,
    /** Documents waiting for this lesson's first message. */
    pendingIds: conversationId ? [] : docs.map((doc) => doc.id),
  };
}

export type SourceDocumentsState = ReturnType<typeof useSourceDocuments>;

export function SourceAttachButton({ state, disabled }: { state: SourceDocumentsState; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  if (!state.enabled) return null;
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        data-testid="source-file-input"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void state.upload(file);
        }}
      />
      <button
        type="button"
        aria-label="Add your own document"
        title="Add your own document: PDF, Word, PowerPoint or text"
        disabled={disabled || state.busy}
        onClick={() => input.current?.click()}
        className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {state.busy ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
      </button>
    </>
  );
}

export function SourceChips({ state }: { state: SourceDocumentsState }) {
  if (!state.enabled || (!state.docs.length && !state.error && !state.busy)) return null;
  return (
    <div data-testid="source-documents" className="flex w-full flex-wrap items-center gap-1.5 px-3 pt-2">
      {state.docs.map((doc) => (
        <span
          key={doc.id}
          data-testid="source-document"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-2.5 pr-1 text-xs"
        >
          <FileText size={12} className="shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{doc.name}</span>
          {doc.truncated ? <span className="text-muted-foreground">(first part)</span> : null}
          <button
            type="button"
            aria-label={`Remove ${doc.name}`}
            onClick={() => void state.remove(doc.id)}
            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-background"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {state.busy ? <span className="text-xs text-muted-foreground">Reading your document…</span> : null}
      {state.error ? (
        <span role="alert" data-testid="source-error" className={cn('text-xs text-red-700')}>
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
