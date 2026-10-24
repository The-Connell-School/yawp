/**
 * The stack page, redesigned (Brian's run 3; Kevin's stack page redesign).
 *
 * The planner chat is where a teacher thinks. This is the class period's run
 * of show: put it in order, check the time, then send it out. It looks like
 * its own place on purpose, and keeps the choices few.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useFetcher, useRevalidator, useSearchParams } from 'react-router';
import { Check, ChevronLeft, BookMarked, Lightbulb, X } from 'lucide-react';
import type { LoadedLessonPacket } from '~/domain/lesson-planner/load-lesson-packet.server';
import type { StackV3 } from '~/domain/lesson-planner/load-stack-v3.server';
import { notYetInYawp, type StackStep } from '~/domain/lesson-planner/stack-steps';
import type { SuggestedPiece } from '~/domain/lesson-planner/stack-suggestions';
import { clampMinutes, stackTiming, timeFixes, type TimeFix } from '~/domain/lesson-planner/stack-timing';
import { STEP_TYPE_LABELS } from '~/domain/lesson-planner/step-types';
import { deckRequest } from '~/domain/lesson-planner/stack-command';
import { BUILD_FROM_STACK_REQUESTS, lectureSlidesRequest } from '~/domain/lesson-planner/suggestions';
import { announceStackChange } from '~/components/lesson-planner/stack-channel';
import { StackUndoToast, useStackRemoval } from '~/components/lesson-planner/use-stack-removal';
import { MaterialRichEditor } from '../material-rich-editor';
import { AddPanel } from './add-panel';
import { useStackDeckBuild } from './stack-deck';
import { FinishLine } from './finish-line';
import { usePaperSteps } from './yawp-checklist';
import { PIECE_DRAG_TYPE, RunOfShow } from './run-of-show';
import { TakeToClass } from './take-to-class';
import { PostToClass, SendLesson } from './share-cards';
import { TimeBar } from './time-bar';
import { HEADING_FONT, STACK_FONTS_HREF, STACK_THEME } from './theme';

export type StackPageV3Data = LoadedLessonPacket & { v3: StackV3 };

const STACK_API = '/api/domain/lesson-planner/stack';
const PACKET_API = '/api/domain/lesson-planner/packet';
const FIRST_OPEN_KEY = 'yawp-stack-intro-closed';

function readIntroClosed(): boolean {
  try {
    return window.localStorage.getItem(FIRST_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function chipDate(iso: string | null): string {
  if (!iso) return 'Pick a day';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

type Change = { text: string; undo: unknown | null };

export function StackPageV3({ data }: { data: StackPageV3Data }) {
  const { conversationId, v3, reviewFlags, packet, published } = data;
  const revalidator = useRevalidator();
  const stackFetcher = useFetcher<Record<string, any>>();
  const packetFetcher = useFetcher<Record<string, any>>();
  const askFetcher = useFetcher<Record<string, any>>();
  const busy = stackFetcher.state !== 'idle' || packetFetcher.state !== 'idle';

  const { hiddenIds, undoable, remove, undo: undoRemove } = useStackRemoval({
    conversationId,
    onCommitted: () => revalidator.revalidate(),
  });

  // Minutes the teacher is stepping, shown at once and saved shortly after.
  const [localMinutes, setLocalMinutes] = useState<Record<string, number>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const loadedKey = v3.steps.map((step) => `${step.key}:${step.minutes}`).join('|');
  useEffect(() => {
    setLocalOrder(null);
    setLocalMinutes({});
    announceStackChange(conversationId);
    // Only when the loaded stack itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  const steps = useMemo(() => {
    const byKey = new Map(v3.steps.map((step) => [step.key, step]));
    const ordered = localOrder
      ? localOrder.flatMap((key) => (byKey.get(key) ? [byKey.get(key)!] : []))
      : v3.steps;
    return ordered
      .filter((step) => !hiddenIds.includes(step.id))
      .map((step) => (localMinutes[step.id] != null ? { ...step, minutes: localMinutes[step.id]! } : step));
  }, [v3.steps, localOrder, localMinutes, hiddenIds]);
  const timing = useMemo(() => stackTiming(steps, data.periodMinutes), [steps, data.periodMinutes]);
  const fixes = useMemo(() => timeFixes(timing), [timing]);
  const [onPaper, markPaper] = usePaperSteps(conversationId);
  const missing = useMemo(() => notYetInYawp(steps, onPaper), [steps, onPaper]);

  const [openId, setOpenId] = useState<string | null>(null);
  // A piece clicked in the chat's stack panel arrives open, in view.
  const [searchParams] = useSearchParams();
  const openParam = searchParams.get('open');
  useEffect(() => {
    if (!openParam) return;
    setOpenId(openParam);
    document.querySelector(`[data-step-id="${CSS.escape(openParam)}"]`)?.scrollIntoView({ block: 'center' });
  }, [openParam]);
  const [editing, setEditing] = useState<StackStep | null>(null);
  const [panel, setPanel] = useState<{ open: boolean; tab: 'conversation' | 'ask' }>({ open: false, tab: 'conversation' });
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [draggingPiece, setDraggingPiece] = useState(false);
  const [change, setChange] = useState<Change | null>(null);
  const [introClosed, setIntroClosed] = useState(true);
  useEffect(() => setIntroClosed(readIntroClosed()), []);

  // What a change answered: Undo for it, and the stack read again.
  const lastHandled = useRef<unknown>(null);
  useEffect(() => {
    const result = stackFetcher.data;
    if (!result || stackFetcher.state !== 'idle' || lastHandled.current === result) return;
    lastHandled.current = result;
    if (result.fix) {
      setChange({
        text: result.fix === 'trim' ? 'Trimmed to fit.' : 'Moved to tomorrow. It waits at the top of the next lesson.',
        undo: result.undo ?? null,
      });
    }
    if (Array.isArray(result.keys) && result.keys.length && insertAt !== null) {
      // The piece opens and the next one lands after it.
      setInsertAt(insertAt + result.keys.length);
      setOpenId(String(result.keys[0]).replace(/^m:/, ''));
    }
  }, [stackFetcher.data, stackFetcher.state, insertAt]);
  useEffect(() => {
    const result = askFetcher.data;
    if (!result || askFetcher.state !== 'idle') return;
    setChange({ text: result.reply ?? '', undo: result.applied ? result.undo : null });
  }, [askFetcher.data, askFetcher.state]);

  function post(fetcher: typeof stackFetcher, action: string, fields: Record<string, string>) {
    fetcher.submit({ conversationId, ...fields }, { method: 'post', action });
  }

  function setMinutes(step: StackStep, minutes: number) {
    const value = clampMinutes(minutes);
    setLocalMinutes((current) => ({ ...current, [step.id]: value }));
    const waiting = timers.current.get(step.id);
    if (waiting) clearTimeout(waiting);
    timers.current.set(
      step.id,
      setTimeout(() => {
        timers.current.delete(step.id);
        post(stackFetcher, STACK_API, { intent: 'set-minutes', materialId: step.id, minutes: String(value) });
      }, 400)
    );
  }

  function reorder(keys: string[]) {
    setLocalOrder(keys);
    post(packetFetcher, PACKET_API, { intent: 'reorder', order: keys.join(',') });
  }

  function move(step: StackStep, direction: 'up' | 'down') {
    const keys = steps.map((entry) => entry.key);
    const from = keys.indexOf(step.key);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= keys.length) return;
    [keys[from], keys[to]] = [keys[to]!, keys[from]!];
    reorder(keys);
  }

  function applyFix(fix: TimeFix) {
    post(stackFetcher, STACK_API, { intent: 'apply-fix', fix: fix.id });
  }

  function undoChange() {
    if (!change?.undo) return;
    post(stackFetcher, STACK_API, { intent: 'undo', snapshot: JSON.stringify(change.undo) });
    setChange({ text: 'Undone.', undo: null });
  }

  function addPiece(piece: { messageId: string; key: string }, at: number | null) {
    const beforeKey = at !== null ? steps[at]?.key ?? '' : '';
    post(stackFetcher, STACK_API, {
      intent: 'add-piece',
      messageId: piece.messageId,
      materialKeys: piece.key,
      beforeKey,
    });
  }

  function dropPieceAt(index: number, event: DragEvent) {
    setDraggingPiece(false);
    const raw = event.dataTransfer.getData(PIECE_DRAG_TYPE);
    if (!raw) return;
    event.preventDefault();
    try {
      const piece = JSON.parse(raw) as { messageId: string; key: string };
      setInsertAt(index);
      addPiece(piece, index);
    } catch {
      // Not a piece from the panel.
    }
  }

  function openPanel(at: number | null, tab: 'conversation' | 'ask' = 'conversation') {
    setInsertAt(at);
    setPanel({ open: true, tab });
  }

  // The deck is built right here, in Ask the planner (Brian's run 6, item 2).
  const deckBuild = useStackDeckBuild({ conversationId, onLanded: () => revalidator.revalidate() });
  const deckFetcher = useFetcher<Record<string, any>>();
  function buildDeck(request: string, line: string) {
    openPanel(null, 'ask');
    void deckBuild.build(request, line);
  }
  const deckToggled = useRef<string | null>(null);
  function toggleDeck(messageId: string, add: boolean, confirmReplace = false) {
    deckToggled.current = messageId;
    deckFetcher.submit(
      {
        conversationId,
        intent: add ? 'add-material' : 'remove-material',
        messageId,
        materialKey: 'deck',
        ...(confirmReplace ? { confirmReplace: '1' } : {}),
      },
      { method: 'post', action: PACKET_API }
    );
  }
  // A deck edited by hand is replaced only once the teacher says so.
  const deckAsked = useRef<unknown>(null);
  useEffect(() => {
    const result = deckFetcher.data;
    if (!result?.conflict || deckFetcher.state !== 'idle' || deckAsked.current === result) return;
    deckAsked.current = result;
    const messageId = deckToggled.current;
    if (messageId && window.confirm(String(result.message))) toggleDeck(messageId, true, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckFetcher.data, deckFetcher.state]);

  const where = (() => {
    if (insertAt === null) return null;
    const before = steps[insertAt - 1];
    const block = timing.blocks[insertAt];
    const minute = block?.startsAt ?? timing.total;
    return before
      ? `Goes in at minute ${minute}, after “${before.title}”`
      : `Goes in at minute 0, at the start`;
  })();

  const setFetcher = stackFetcher;
  const isSet = Boolean(v3.setAt);
  // Two different saves, named apart (Brian's run 4): every change is a
  // saved draft; the library is the teacher's choice.
  const saveState = busy ? 'Saving…' : isSet ? 'Lesson set · saved' : 'Draft saved';
  const templateName = `${steps.map((step) => STEP_TYPE_LABELS[step.type]).slice(0, 3).join(', ')} (${timing.total} min)`;

  return (
    // The app shell is a fixed-height frame: the page owns its scrolling.
    <div data-testid="stack-v3" className="h-full w-full overflow-y-auto" style={STACK_THEME}>
      {/* The page's own fonts, loaded only here. */}
      <link rel="stylesheet" href={STACK_FONTS_HREF} />
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-5 sm:px-6">
        <header className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to={`/app/lesson-planner?c=${conversationId}`}
              title="Your chat, with this stack saved"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--sv-line)] bg-[var(--sv-card)] px-3 py-1.5 text-sm font-semibold transition hover:bg-[#F1EBE2]"
            >
              <ChevronLeft size={15} /> Back to planning
            </Link>
            <div className="flex items-center gap-3">
              <span data-testid="stack-save-state" className="inline-flex items-center gap-1 text-xs text-[var(--sv-muted)]">
                <Check size={13} /> {saveState}
              </span>
              <button
                type="button"
                data-testid="packet-publish"
                onClick={() => post(packetFetcher, PACKET_API, { intent: published ? 'unpublish' : 'publish' })}
                className="inline-flex items-center gap-1 rounded-full bg-[#FBE5DC] px-3 py-1.5 text-xs font-semibold text-[var(--sv-primary)]"
              >
                <BookMarked size={13} /> {published ? 'In my library' : 'Save to my library'}
              </button>
              <Link
                to="/app/lesson-planner/library"
                data-testid="open-library"
                className="text-xs font-semibold text-[var(--sv-primary)] underline"
              >
                My library
              </Link>
            </div>
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sv-primary)]">
            Your lesson, start to finish
          </p>
          <h1 data-testid="stack-title" className="text-3xl font-extrabold leading-tight sm:text-4xl" style={HEADING_FONT}>
            {data.nameIsProvisional ? 'Untitled lesson' : packet.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            {v3.className ? (
              <span data-testid="stack-chip-class" className="rounded-full bg-[#EFE8DD] px-3 py-1">
                {v3.className}
              </span>
            ) : null}
            <label className="relative cursor-pointer rounded-full bg-[#EFE8DD] px-3 py-1">
              <span data-testid="stack-chip-date">{chipDate(v3.lessonDate)}</span>
              <input
                type="date"
                aria-label="Lesson date"
                value={dateInputValue(v3.lessonDate)}
                onChange={(event) => post(setFetcher, STACK_API, { intent: 'set-details', lessonDate: event.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <label className="flex items-center rounded-full bg-[#EFE8DD] px-3 py-1">
              <input
                type="number"
                aria-label="Period length in minutes"
                data-testid="stack-chip-period"
                min={10}
                max={240}
                defaultValue={data.periodMinutes ?? ''}
                placeholder="—"
                onBlur={(event) => {
                  const value = Number(event.target.value);
                  if (value >= 10 && value !== data.periodMinutes) {
                    post(setFetcher, STACK_API, { intent: 'set-details', periodMinutes: String(value) });
                  }
                }}
                className="w-[3ch] appearance-none bg-transparent text-right tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              -minute period
            </label>
          </div>
        </header>

        {!introClosed && v3.firstOpen ? (
          <div data-testid="stack-intro" className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--sv-line)] bg-[var(--sv-card)] px-4 py-3 text-sm">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-[var(--sv-primary)]" />
            <p className="flex-1">
              This is your lesson. Put it in order, check the time, or ask the planner to change
              anything. When it looks right, set it and take it to class.
            </p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                setIntroClosed(true);
                try {
                  window.localStorage.setItem(FIRST_OPEN_KEY, '1');
                } catch {
                  // A private window forgets; the line just shows again.
                }
              }}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <TimeBar
              timing={timing}
              fixes={fixes}
              busy={busy}
              onApplyFix={applyFix}
              onOpenStep={(id) => {
                setOpenId(id);
                document.querySelector(`[data-step-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }}
            />
            <section>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-bold" style={HEADING_FONT}>
                  Run of show
                </h2>
                <div className="flex items-center gap-3 text-xs text-[var(--sv-muted)]">
                  <span className="hidden sm:inline">Drag to reorder. Times update as you go.</span>
                  <button
                    type="button"
                    data-testid="open-ask"
                    onClick={() => openPanel(null, 'ask')}
                    className="rounded-full border border-[var(--sv-line)] bg-[var(--sv-card)] px-3 py-1 font-semibold text-[var(--sv-ink)] transition hover:bg-[#F1EBE2]"
                  >
                    Ask the planner
                  </button>
                </div>
              </div>
              {steps.length ? (
                <RunOfShow
                  conversationId={conversationId}
                  hasDeck={Boolean(v3.deck)}
                  onLectureSlides={(step) =>
                    buildDeck(lectureSlidesRequest(step.title, { hasDeck: Boolean(v3.deck) }), `Slides for “${step.title}”`)
                  }
                  missingIds={new Set(missing.map((step) => step.id))}
                  steps={steps}
                  blocks={timing.blocks}
                  openId={openId}
                  setOpenId={setOpenId}
                  insertAt={panel.open ? insertAt : null}
                  dragging={draggingPiece}
                  onInsertAt={(index) => openPanel(index)}
                  onDropPieceAt={dropPieceAt}
                  onMinutes={setMinutes}
                  onMove={move}
                  onReorder={reorder}
                  onRemove={(step) => remove({ id: step.id, title: step.title, origin: step.origin })}
                  onEdit={setEditing}
                  onAddAtEnd={() => openPanel(steps.length)}
                  busy={busy}
                />
              ) : (
                <div className="rounded-xl border-2 border-dashed border-[var(--sv-line)] p-6 text-center text-sm text-[var(--sv-muted)]">
                  Nothing in this lesson yet.{' '}
                  <button type="button" className="font-semibold text-[var(--sv-primary)] underline" onClick={() => openPanel(0)}>
                    Add a piece from the planner
                  </button>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-5">
            <FinishLine
              conversationId={conversationId}
              timing={timing}
              createdAt={v3.createdAt}
              setAt={v3.setAt}
              lessonDate={v3.lessonDate}
              missing={missing}
              onPaper={markPaper}
              busy={busy}
              onSet={() => post(setFetcher, STACK_API, { intent: 'set-lesson' })}
              onKeepEditing={() => post(setFetcher, STACK_API, { intent: 'unset-lesson' })}
              runShow={reviewFlags.runShow}
              templates={reviewFlags.templates}
              suggestedTemplateName={templateName}
              onSaveTemplate={(name) => post(setFetcher, STACK_API, { intent: 'save-template', name })}
            />
            <TakeToClass
              conversationId={conversationId}
              planExportV2={reviewFlags.planExportV2}
              deckV2={reviewFlags.deckV2}
              stepCount={steps.length}
              handoutCount={steps.filter((step) => step.hasHandout).length}
              deck={v3.deck}
              builtDeck={
                v3.conversationDeck && !v3.deck
                  ? {
                      presentHref: `/present/${conversationId}/${v3.conversationDeck.messageId}?from=stack`,
                      onStack: v3.conversationDeck.onStack,
                      onAdd: () => openPanel(null, v3.conversationDeck!.onStack ? 'ask' : 'conversation'),
                    }
                  : null
              }
              onBuildDeck={() =>
                buildDeck(
                  BUILD_FROM_STACK_REQUESTS[v3.deck ? 'rebuild-deck' : 'deck'],
                  v3.deck ? 'Rebuild the slide deck' : 'Build the slide deck'
                )
              }
            >
              {reviewFlags.share ? <PostToClass conversationId={conversationId} title={packet.title} /> : null}
            </TakeToClass>
            {reviewFlags.share ? <SendLesson conversationId={conversationId} standards={v3.standards} /> : null}
          </div>
        </div>
      </div>

      <AddPanel
        conversationId={conversationId}
        open={panel.open}
        tab={panel.tab}
        setTab={(tab) => setPanel((current) => ({ ...current, tab }))}
        onClose={() => {
          setPanel((current) => ({ ...current, open: false }));
          setInsertAt(null);
        }}
        where={where}
        timing={timing}
        steps={steps}
        suggestions={v3.suggestions}
        askHistory={v3.askHistory}
        onAdd={(piece: SuggestedPiece) => addPiece(piece, insertAt)}
        onAsk={(line) => {
          const request = deckRequest(line, { hasDeck: Boolean(v3.deck) });
          if (request) return buildDeck(request, line);
          askFetcher.submit(
            {
              conversationId,
              intent: 'command',
              line,
              ...(insertAt !== null && steps[insertAt - 1] ? { insertAfter: steps[insertAt - 1]!.title } : {}),
            },
            { method: 'post', action: STACK_API }
          );
        }}
        askBusy={askFetcher.state !== 'idle' || deckBuild.progress !== null}
        deck={{
          sourceMessageId: v3.deck?.sourceMessageId ?? null,
          hasDeck: Boolean(v3.deck),
          onToggle: (messageId, add) => toggleDeck(messageId, add),
          building: deckBuild.progress,
          error: deckBuild.error,
          periodMinutes: data.periodMinutes,
          // One built on the stack is already in Ask the planner's history.
          fromConversation: v3.conversationDeck?.onStack ? null : v3.conversationDeck,
        }}
        lastAnswer={change ? { text: change.text, canUndo: Boolean(change.undo) } : null}
        onUndo={undoChange}
        onDragPiece={setDraggingPiece}
        busy={busy}
      />

      {editing ? (
        <div
          role="dialog"
          aria-label={`Edit ${editing.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--sv-card)] p-5">
            <h2 className="mb-3 text-lg font-bold" style={HEADING_FONT}>
              {editing.title}
            </h2>
            <MaterialRichEditor
              materialId={editing.id}
              conversationId={conversationId}
              content={editing.content}
              onDone={() => {
                setEditing(null);
                revalidator.revalidate();
              }}
            />
          </div>
        </div>
      ) : null}

      {change && !panel.open ? (
        <div
          role="status"
          data-testid="stack-change"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[var(--sv-ink)] px-4 py-2.5 text-sm text-white shadow-lg"
        >
          <span>{change.text}</span>
          {change.undo ? (
            <button type="button" onClick={undoChange} className="font-semibold underline underline-offset-2">
              Undo
            </button>
          ) : null}
          <button type="button" aria-label="Dismiss" onClick={() => setChange(null)}>
            <X size={14} />
          </button>
        </div>
      ) : null}
      <StackUndoToast undoable={undoable} onUndo={undoRemove} />
    </div>
  );
}
