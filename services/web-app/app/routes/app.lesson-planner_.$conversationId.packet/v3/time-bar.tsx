/**
 * Planned total against the period (stack page redesign): one bar, a block
 * per step sized by its minutes and colored by its type, leftover striped, a
 * purple line under the writing, the fixes when it runs long, and the share
 * of class spent writing. Minutes change on the step cards, never by dragging
 * the bar.
 */
import { PenLine } from 'lucide-react';
import type { StackTiming, TimeFix } from '~/domain/lesson-planner/stack-timing';
import { STEP_TYPE_COLORS, STEP_TYPE_LABELS, STEP_TYPES } from '~/domain/lesson-planner/step-types';
import { cn } from '~/utils/misc';
import { HEADING_FONT, typeBlockStyle } from './theme';

export function TimeBar({
  timing,
  fixes,
  onOpenStep,
  onApplyFix,
  busy,
  extend,
}: {
  timing: StackTiming;
  fixes: TimeFix[];
  onOpenStep: (id: string) => void;
  onApplyFix: (fix: TimeFix) => void;
  busy: boolean;
  /**
   * Over time, with extensions on (Kevin's note 8b): the step to set aside
   * for extra time, and the calmer lead line. Undefined with them off.
   */
  extend?: { lead: string; step: { id: string; title: string } | null; onMove: (id: string) => void };
}) {
  const span = Math.max(timing.period ?? 0, timing.total, 1);
  const status =
    timing.over > 0 ? 'over' : timing.period && timing.total === timing.period ? 'on' : 'spare';
  const usedTypes = STEP_TYPES.filter((type) => timing.blocks.some((block) => block.type === type));
  return (
    <section
      data-testid="time-bar-card"
      className="rounded-2xl border border-[var(--sv-line)] bg-[var(--sv-card)] p-5"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p>
          <span data-testid="time-total" className="text-3xl font-extrabold tabular-nums" style={HEADING_FONT}>
            {timing.total}
          </span>{' '}
          <span className="text-sm text-[var(--sv-muted)]">
            {timing.period ? `of ${timing.period} minutes planned` : 'minutes planned'}
          </span>
        </p>
        <span
          data-testid="time-status"
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold',
            status === 'over'
              ? 'bg-amber-100 text-amber-900'
              : status === 'on'
                ? 'bg-[#D5EBE5] text-[#1F5C4E]'
                : 'bg-[#EFE8DD] text-[var(--sv-ink)]'
          )}
        >
          {timing.status}
        </span>
      </div>

      <div className="relative">
        <div
          data-testid="time-bar"
          role="group"
          aria-label={`Planned ${timing.total} of ${timing.period ?? timing.total} minutes`}
          className="flex h-12 w-full overflow-hidden rounded-lg border border-[var(--sv-line)]"
        >
          {timing.blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              data-testid="time-block"
              data-type={block.type}
              onClick={() => onOpenStep(block.id)}
              title={`${block.title} · ${block.minutes} min`}
              aria-label={`${block.title}, ${block.minutes} minutes`}
              className="flex min-w-0 items-center justify-center border-r border-white/70 text-[11px] font-semibold tabular-nums transition hover:brightness-95"
              style={{ ...typeBlockStyle(block.type), flexBasis: `${(block.minutes / span) * 100}%`, flexGrow: 0, flexShrink: 0 }}
            >
              {block.minutes >= 3 ? `${block.minutes}′` : ''}
            </button>
          ))}
          {timing.leftover > 0 ? (
            <div
              data-testid="time-leftover"
              aria-label={`${timing.leftover} minutes left`}
              className="flex-1"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, #EFE8DD 0 6px, #F8F4EE 6px 12px)',
              }}
            />
          ) : null}
        </div>
        {/* The writing line: thin purple under every writing step. */}
        <div className="mt-1 flex h-1 w-full" aria-hidden>
          {timing.blocks.map((block) => (
            <div
              key={block.id}
              data-testid={block.isWriting ? 'writing-line' : undefined}
              className="h-1 rounded-full"
              style={{
                flexBasis: `${(block.minutes / span) * 100}%`,
                flexShrink: 0,
                backgroundColor: block.isWriting ? 'var(--sv-writing)' : 'transparent',
              }}
            />
          ))}
        </div>
      </div>

      {timing.over > 0 && (fixes.length || extend?.step) ? (
        <div data-testid="time-fixes" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          {extend ? (
            <p data-testid="time-over-lead" className="text-sm font-semibold text-amber-950">
              {extend.lead} Ways to get back on time:
            </p>
          ) : (
            <p className="text-sm font-semibold text-amber-950">
              You're {timing.over} min over. {fixes.length === 1 ? 'One way' : 'Two ways'} to get back on time:
            </p>
          )}
          <ul className="mt-2 flex flex-col gap-2">
            {extend?.step ? (
              <li data-testid="time-fix-extend" className="flex items-center justify-between gap-3 text-sm">
                <span>Save “{extend.step.title}” for extra time, after the closing</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => extend.onMove(extend.step!.id)}
                  className="shrink-0 rounded-full bg-[var(--sv-ink)] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  Move to extensions
                </button>
              </li>
            ) : null}
            {fixes.map((fix) => (
              <li key={fix.id} data-testid="time-fix" className="flex items-center justify-between gap-3 text-sm">
                <span>{fix.text}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApplyFix(fix)}
                  className="shrink-0 rounded-full bg-[var(--sv-ink)] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  Apply
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900/80">Fixes never cut writing time.</p>
        </div>
      ) : null}

      <div
        data-testid="writing-strip"
        className="mt-4 flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ backgroundColor: 'var(--sv-writing-strip)' }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: 'var(--sv-writing)' }}
        >
          <PenLine size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="text-lg font-extrabold" style={{ ...HEADING_FONT, color: 'var(--sv-writing)' }}>
              {timing.writingPercent}%
            </span>{' '}
            of class is writing · {timing.writingMinutes} min
          </p>
          {timing.writingSources ? (
            <p className="text-xs text-[var(--sv-muted)]">From {timing.writingSources}</p>
          ) : null}
        </div>
        <div
          className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-white/80"
          role="meter"
          aria-label="Share of class spent writing"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={timing.writingPercent}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, timing.writingPercent)}%`, backgroundColor: 'var(--sv-writing)' }}
          />
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--sv-muted)]" aria-label="Legend">
        {usedTypes.map((type) => (
          <li key={type} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STEP_TYPE_COLORS[type].accent }} />
            {STEP_TYPE_LABELS[type]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: 'var(--sv-writing)' }} />
          Writing (purple line)
        </li>
      </ul>
    </section>
  );
}
