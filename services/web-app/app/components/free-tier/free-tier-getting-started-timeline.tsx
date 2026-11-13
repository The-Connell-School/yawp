import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '~/utils/misc';

export type FreeTierGettingStartedStepState = 'done' | 'current' | 'upcoming';

export type FreeTierGettingStartedStep = {
  key: string;
  label: string;
  state: FreeTierGettingStartedStepState;
  content?: ReactNode;
};

const PE3_ACCENT = 'hsl(155.2174 42.5926% 21.1765%)';

export function FreeTierGettingStartedTimeline({
  title,
  progressLabel,
  steps,
  testId,
  variant = 'panel',
  fillVertical = false,
}: {
  title: string;
  progressLabel: string;
  steps: FreeTierGettingStartedStep[];
  testId?: string;
  /** Match teacher class cards in the My Classes grid. */
  variant?: 'panel' | 'class-card';
  /** Stretch steps to match a tall neighbor (e.g. class card in the home grid). */
  fillVertical?: boolean;
}) {
  const stepList = (
    <ol
      className={cn(
        'flex list-none flex-col p-0',
        variant === 'class-card' ? 'gap-0.5' : fillVertical ? 'mt-3 min-h-0 flex-1 justify-between gap-0' : 'mt-0 gap-1.5'
      )}
    >
      {steps.map((step, index) => (
        <li
          key={step.key}
          className={cn(
            'relative flex items-start gap-2.5',
            variant === 'class-card' ? 'py-1 text-xs' : 'py-1.5 text-sm',
            fillVertical && variant === 'panel' && 'min-h-0 flex-1',
            step.state === 'current'
              ? 'font-semibold text-[#1b1b1b]'
              : step.state === 'done'
                ? 'font-normal text-muted-foreground'
                : 'font-normal text-muted-foreground'
          )}
        >
          {index < steps.length - 1 ? (
            <span
              aria-hidden
              className={cn(
                'absolute left-[9px] top-[20px] w-0.5 bg-border',
                fillVertical && variant === 'panel'
                  ? 'bottom-0'
                  : 'bottom-[-10px]'
              )}
            />
          ) : null}
          <FreeTierGettingStartedTimelineMarker
            state={step.state}
            size={variant === 'class-card' ? 'sm' : 'md'}
          />
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                step.state === 'done' && 'line-through decoration-muted-foreground/60'
              )}
            >
              {step.label}
            </span>
            {step.content ? (
              <div className="free-tier-getting-started-step-accessory mt-1.5 w-full font-normal">
                {step.content}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );

  if (variant === 'class-card') {
    return (
      <section
        aria-label={title}
        data-testid={testId}
        className="relative flex min-h-full flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5"
      >
        <div className="flex h-32 w-full shrink-0 flex-col items-center justify-center gap-1 border-b border-black/5 bg-muted/15 px-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="text-sm font-semibold text-foreground">{progressLabel}</p>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">{stepList}</div>
      </section>
    );
  }

  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-xl border bg-popover p-[18px] shadow-sm',
        fillVertical && 'flex h-full min-h-full flex-col'
      )}
      data-testid={testId}
    >
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">{title}</h2>
        <span className="text-xs text-muted-foreground">{progressLabel}</span>
      </div>
      {stepList}
    </section>
  );
}

function FreeTierGettingStartedTimelineMarker({
  state,
  size = 'md',
}: {
  state: FreeTierGettingStartedStepState;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'size-4' : 'size-5';
  const dot = size === 'sm' ? 'size-1' : 'size-1.5';
  if (state === 'done') {
    return (
      <span
        aria-hidden
        className={cn(
          'relative z-[1] box-border flex shrink-0 items-center justify-center rounded-full border-2 border-emerald-800 bg-emerald-800 text-white',
          box
        )}
      >
        <Check size={size === 'sm' ? 10 : 12} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'relative z-[1] box-border flex shrink-0 items-center justify-center rounded-full border-2 bg-background',
        box,
        state === 'current' ? 'border-[hsl(155.2174_42.5926%_21.1765%)]' : 'border-border'
      )}
      style={state === 'current' ? { borderColor: PE3_ACCENT } : undefined}
    >
      {state === 'current' ? (
        <span
          className={cn('rounded-full', dot)}
          style={{ backgroundColor: PE3_ACCENT }}
        />
      ) : null}
    </span>
  );
}
