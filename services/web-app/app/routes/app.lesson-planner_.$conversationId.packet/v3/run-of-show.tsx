/**
 * The run of show (stack page redesign): one compact card per step with the
 * minute it starts, its type, the Writing badge, a minutes stepper, move and
 * remove. A card opens to an excerpt and the ways to change it. Between any
 * two cards a "+" puts a new piece right there.
 */
import { useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileText,
  GripVertical,
  Minus,
  MonitorPlay,
  PenLine,
  Plus,
  X,
} from 'lucide-react';
import type { StackStep } from '~/domain/lesson-planner/stack-steps';
import type { TimedBlock } from '~/domain/lesson-planner/stack-timing';
import { isLectureStep, stepChipText } from '~/domain/lesson-planner/step-types';
import { cn } from '~/utils/misc';
import { typeChipStyle } from './theme';

export const PIECE_DRAG_TYPE = 'application/x-yawp-piece';
const STEP_DRAG_TYPE = 'application/x-yawp-step';

export function TypeChip({ step }: { step: Pick<StackStep, 'type' | 'label'> }) {
  return (
    <span
      data-testid="type-chip"
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={typeChipStyle(step.type)}
    >
      {stepChipText(step.type, step.label)}
    </span>
  );
}

export function WritingBadge() {
  return (
    <span
      data-testid="writing-badge"
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: 'var(--sv-writing)' }}
    >
      <PenLine size={10} />
      Writing
    </span>
  );
}

function InsertPoint({
  active,
  dragging,
  onInsert,
  onDropPiece,
  label,
}: {
  active: boolean;
  dragging: boolean;
  onInsert: () => void;
  onDropPiece: (event: DragEvent) => void;
  label: string;
}) {
  const [over, setOver] = useState(false);
  if (active) {
    return (
      <div
        data-testid="insert-placeholder"
        className="my-1 flex items-center gap-2 rounded-xl border-2 border-dashed border-[var(--sv-coral)] bg-[#FBE5DC] px-4 py-3 text-sm font-semibold text-[var(--sv-primary)]"
      >
        <Plus size={14} /> New piece goes here
      </div>
    );
  }
  if (dragging) {
    return (
      <div
        data-testid="drop-slot"
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          setOver(false);
          onDropPiece(event);
        }}
        className={cn(
          'my-1 flex items-center justify-center rounded-xl border-2 border-dashed text-xs font-semibold transition-all',
          over
            ? 'h-14 border-[var(--sv-coral)] bg-[#FBE5DC] text-[var(--sv-primary)]'
            : 'h-6 border-[var(--sv-line)] text-[var(--sv-muted)]'
        )}
      >
        Drop here
      </div>
    );
  }
  return (
    <div className="group relative flex h-3 items-center">
      <div className="h-px w-full bg-transparent transition group-hover:bg-[var(--sv-coral)] group-focus-within:bg-[var(--sv-coral)]" />
      <button
        type="button"
        data-testid="insert-point"
        aria-label={label}
        onClick={onInsert}
        className="absolute left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--sv-coral)] bg-[var(--sv-card)] text-[var(--sv-primary)] opacity-0 transition focus:opacity-100 group-hover:opacity-100"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

export function RunOfShow({
  conversationId,
  steps,
  blocks,
  openId,
  setOpenId,
  insertAt,
  dragging,
  onInsertAt,
  onDropPieceAt,
  onMinutes,
  onMove,
  onReorder,
  onRemove,
  onEdit,
  onAddAtEnd,
  busy,
  hasDeck = false,
}: {
  conversationId: string;
  steps: StackStep[];
  blocks: TimedBlock[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  insertAt: number | null;
  /** A piece from the panel is being dragged: every gap is a drop slot. */
  dragging: boolean;
  onInsertAt: (index: number) => void;
  onDropPieceAt: (index: number, event: DragEvent) => void;
  onMinutes: (step: StackStep, minutes: number) => void;
  onMove: (step: StackStep, direction: 'up' | 'down') => void;
  onReorder: (keys: string[]) => void;
  onRemove: (step: StackStep) => void;
  onEdit: (step: StackStep) => void;
  onAddAtEnd: () => void;
  busy: boolean;
  /** The lesson has a deck already: a lecture's slides rebuild it. */
  hasDeck?: boolean;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const byId = new Map(blocks.map((block) => [block.id, block]));

  const gap = (index: number) => (
    <InsertPoint
      key={`gap-${index}`}
      active={insertAt === index}
      dragging={dragging}
      onInsert={() => onInsertAt(index)}
      onDropPiece={(event) => onDropPieceAt(index, event)}
      label={
        index === 0
          ? 'Add a piece at the start'
          : `Add a piece after ${steps[index - 1]?.title ?? 'this step'}`
      }
    />
  );

  return (
    <div data-testid="run-of-show">
      {gap(0)}
      {steps.map((step, index) => {
        const block = byId.get(step.id);
        const minutes = block?.minutes ?? step.minutes ?? 0;
        const open = openId === step.id;
        const editable = step.origin === 'material';
        return (
          <div key={step.key}>
            <article
              data-testid="run-card"
              data-step-id={step.id}
              data-open={open ? 'true' : undefined}
              draggable={editable}
              onDragStart={(event) => {
                setDragKey(step.key);
                event.dataTransfer.setData(STEP_DRAG_TYPE, step.key);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragKey(null)}
              onDragOver={(event) => {
                if (dragKey && event.dataTransfer.types.includes(STEP_DRAG_TYPE)) event.preventDefault();
              }}
              onDrop={(event) => {
                const moving = event.dataTransfer.getData(STEP_DRAG_TYPE);
                if (!moving || moving === step.key) return;
                event.preventDefault();
                const keys = steps.map((entry) => entry.key).filter((key) => key !== moving);
                keys.splice(keys.indexOf(step.key), 0, moving);
                onReorder(keys);
                setDragKey(null);
              }}
              className={cn(
                'overflow-hidden rounded-xl border bg-[var(--sv-card)] transition',
                open ? 'border-[var(--sv-ink)] shadow-sm' : 'border-[var(--sv-line)]',
                dragKey === step.key && 'opacity-50'
              )}
            >
              <div className="flex items-stretch">
                <div className="flex w-12 shrink-0 flex-col items-center justify-center border-r border-[var(--sv-line)] py-2 sm:w-16">
                  {/* The first step starts the class; "00 min in" read as a
                      step with no time (Kevin's notes). */}
                  {block?.startsAt ? (
                    <>
                      <span data-testid="run-card-start" className="text-lg font-bold tabular-nums">
                        {String(block.startsAt).padStart(2, '0')}
                      </span>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--sv-muted)]">
                        min in
                      </span>
                    </>
                  ) : (
                    <span
                      data-testid="run-card-start"
                      className="text-[10px] font-bold uppercase tracking-wide text-[var(--sv-muted)]"
                    >
                      Start
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2.5">
                  {editable ? (
                    <GripVertical size={14} className="shrink-0 cursor-grab text-[var(--sv-muted)]" aria-hidden />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : step.id)}
                    aria-expanded={open}
                    className="min-w-[9rem] flex-1 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <TypeChip step={step} />
                      {step.isWriting ? <WritingBadge /> : null}
                    </span>
                    <span data-testid="run-card-title" className="mt-1 block text-sm font-semibold sm:truncate">
                      {step.title}
                    </span>
                  </button>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Fewer minutes for ${step.title}`}
                      disabled={!editable || busy || minutes <= 1}
                      onClick={() => onMinutes(step, minutes - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--sv-line)] transition hover:bg-[#F1EBE2] disabled:opacity-40"
                    >
                      <Minus size={12} />
                    </button>
                    <span
                      data-testid="step-minutes"
                      className={cn('w-12 text-center text-sm font-semibold tabular-nums', block?.suggested && 'text-[var(--sv-muted)]')}
                      title={block?.suggested ? 'Suggested time' : undefined}
                    >
                      {minutes} min
                    </span>
                    <button
                      type="button"
                      aria-label={`More minutes for ${step.title}`}
                      disabled={!editable || busy}
                      onClick={() => onMinutes(step, minutes + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--sv-line)] transition hover:bg-[#F1EBE2] disabled:opacity-40"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-l border-[var(--sv-line)] px-1 sm:flex-row sm:px-2">
                  <button
                    type="button"
                    aria-label={`Move ${step.title} up`}
                    disabled={index === 0 || busy}
                    onClick={() => onMove(step, 'up')}
                    className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[#F1EBE2] disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${step.title} down`}
                    disabled={index === steps.length - 1 || busy}
                    onClick={() => onMove(step, 'down')}
                    className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[#F1EBE2] disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${step.title}`}
                    disabled={busy}
                    onClick={() => onRemove(step)}
                    className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-red-50 hover:text-red-700"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              {open ? (
                <div data-testid="run-card-detail" className="border-t border-[var(--sv-line)] bg-[#FBF8F3] px-4 py-3 sm:pl-[5.25rem]">
                  {step.excerpt ? <p className="text-sm leading-relaxed">{step.excerpt}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    {step.hasHandout ? (
                      <span data-testid="has-handout" className="inline-flex items-center gap-1 rounded-md bg-[#EFE8DD] px-2 py-1 font-semibold">
                        <FileText size={12} /> Has a handout
                      </span>
                    ) : null}
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => onEdit(step)}
                        className="font-semibold text-[var(--sv-primary)] underline underline-offset-2"
                      >
                        Edit this step
                      </button>
                    ) : null}
                    <Link
                      to={`/app/lesson-planner?c=${conversationId}&rework=${encodeURIComponent(step.title)}`}
                      className="font-semibold text-[var(--sv-primary)] underline underline-offset-2"
                    >
                      Rework it in the planner
                    </Link>
                    {isLectureStep(step.title) ? (
                      <Link
                        to={`/app/lesson-planner?c=${conversationId}&build=lecture&step=${encodeURIComponent(step.title)}${hasDeck ? '&deck=1' : ''}`}
                        data-testid="lecture-slides"
                        className="inline-flex items-center gap-1 font-semibold text-[var(--sv-primary)] underline underline-offset-2"
                      >
                        <MonitorPlay size={12} /> Build slides for this lecture
                      </Link>
                    ) : null}
                    {step.create ? (
                      <Link
                        to={step.create.href}
                        data-testid="stack-create-assignment"
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--sv-writing-strip)] px-2 py-1 font-semibold"
                        style={{ color: 'var(--sv-writing)' }}
                      >
                        {step.create.created ? <Check size={12} /> : <PenLine size={12} />}
                        {step.create.label}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
            {gap(index + 1)}
          </div>
        );
      })}
      <button
        type="button"
        data-testid="add-another"
        onClick={onAddAtEnd}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--sv-line)] py-3 text-sm font-semibold text-[var(--sv-muted)] transition hover:border-[var(--sv-coral)] hover:text-[var(--sv-primary)]"
      >
        <Plus size={14} /> Add another piece from the planner
      </button>
      <p className="mt-2 text-center text-xs text-[var(--sv-muted)]">
        Or hover between any two steps and click + to add one right there.
      </p>
    </div>
  );
}
