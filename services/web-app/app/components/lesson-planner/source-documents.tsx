/**
 * The teacher's own documents in the planner chat (Oct 21): a paperclip to
 * add one, and a chip for each with a way to take it back out. Added before
 * a lesson's first message, they wait in this tab and go with that message.
 *
 * A deck kept whole (Nov 1) says how many of its pictures were kept. What to
 * do with it, rework it or keep it as is, is asked in the conversation under
 * the planner's reply (Brian, Nov 4; see deck-ask-card.tsx), not here.
 *
 * The chips are what goes with the next message: once it is sent, they clear
 * (Brian, Nov 4). The documents stay in the lesson, and the planner keeps
 * reading them.
 */
import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { cn } from '~/utils/misc';

export type DeckChoice = 'teach' | 'refresh';
/** A deck kept whole: how many pictures were kept, and what the teacher chose. */
export type SourceDeck = { pictures: number; mode: DeckChoice | null };
export type SourceChip = { id: string; name: string; truncated: boolean; deck?: SourceDeck | null };
/** Which deck choices are on for this school. */
export type DeckChoices = { teach: boolean; refresh: boolean };

const NO_CHOICES: DeckChoices = { teach: false, refresh: false };

const ACCEPT = '.pdf,.docx,.pptx,.txt,.md';
const API = '/api/domain/lesson-planner/uploads';

export function useSourceDocuments({
  conversationId,
  saved,
  enabled,
  deckChoices = NO_CHOICES,
}: {
  conversationId: string | null;
  /** This lesson's documents, from the loader. */
  saved: SourceChip[];
  enabled: boolean;
  deckChoices?: DeckChoices;
}) {
  const [added, setAdded] = useState<SourceChip[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  // Choices made here, ahead of the loader: id → mode.
  const [modes, setModes] = useState<Record<string, DeckChoice | null>>({});
  // Sent with a message: no longer shown above the message bar.
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different lesson starts from its own documents.
  useEffect(() => {
    setAdded([]);
    setRemoved(new Set());
    setModes({});
    setSent(new Set());
    setError(null);
  }, [conversationId]);

  const savedIds = new Set(saved.map((doc) => doc.id));
  const withMode = (doc: SourceChip): SourceChip =>
    doc.deck && doc.id in modes ? { ...doc, deck: { ...doc.deck, mode: modes[doc.id] ?? null } } : doc;
  /** Every document in the lesson, saved or just added. */
  const allDocs = [...saved, ...added.filter((doc) => !savedIds.has(doc.id))]
    .filter((doc) => !removed.has(doc.id))
    .map(withMode);
  /** What goes with the next message: added here and not sent yet. */
  const docs = added.filter((doc) => !removed.has(doc.id) && !sent.has(doc.id)).map(withMode);

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

  async function choose(id: string, mode: DeckChoice | null) {
    const before = docs.find((doc) => doc.id === id)?.deck?.mode ?? null;
    setModes((current) => ({ ...current, [id]: mode }));
    setError(null);
    const form = new FormData();
    form.set('intent', 'mode');
    form.set('uploadId', id);
    form.set('mode', mode ?? '');
    const response = await fetch(API, { method: 'POST', body: form }).catch(() => null);
    if (!response?.ok) {
      setModes((current) => ({ ...current, [id]: before }));
      setError('That choice could not be saved. Try again.');
    }
  }

  return {
    enabled,
    docs,
    allDocs,
    /** The next message has gone: its documents leave the message bar. */
    markSent: () => setSent(new Set([...sent, ...docs.map((doc) => doc.id)])),
    busy,
    error,
    upload,
    remove,
    deckChoices,
    choose,
    /** Documents waiting for this lesson's first message. */
    pendingIds: conversationId ? [] : allDocs.map((doc) => doc.id),
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
          className={cn(
            'inline-flex max-w-full flex-wrap items-center gap-1.5 border bg-muted/50 py-1 pl-2.5 pr-1 text-xs',
            doc.deck ? 'rounded-2xl' : 'rounded-full'
          )}
        >
          <FileText size={12} className="shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{doc.name}</span>
          {doc.truncated ? <span className="text-muted-foreground">(first part)</span> : null}
          {doc.deck ? (
            <span data-testid="source-deck-pictures" className="whitespace-nowrap text-muted-foreground">
              {doc.deck.pictures === 1 ? '1 picture kept' : `${doc.deck.pictures} pictures kept`}
            </span>
          ) : null}
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
