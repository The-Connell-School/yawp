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

const PE3_ACCENT = 'hsl(14.8837 58.9041% 57.0588%)';

export function FreeTierGettingStartedTimeline({
  title,
  progressLabel,
  steps,
  testId,
}: {
  title: string;
  progressLabel: string;
  steps: FreeTierGettingStartedStep[];
  testId?: string;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border bg-popover p-[18px] shadow-sm"
      data-testid={testId}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">{title}</h2>
        <span className="text-xs text-muted-foreground">{progressLabel}</span>
      </div>
      <ol className="mt-0 flex list-none flex-col gap-1.5 p-0">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              'relative flex items-start gap-2.5 py-1.5 text-sm',
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
                className="absolute bottom-[-14px] left-[9px] top-[22px] w-0.5 bg-border"
              />
            ) : null}
            <FreeTierGettingStartedTimelineMarker state={step.state} />
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  step.state === 'done' && 'line-through decoration-muted-foreground/60'
                )}
              >
                {step.label}
              </span>
              {step.content}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FreeTierGettingStartedTimelineMarker({
  state,
}: {
  state: FreeTierGettingStartedStepState;
}) {
  if (state === 'done') {
    return (
      <span
        aria-hidden
        className="relative z-[1] box-border flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-emerald-800 bg-emerald-800 text-white"
      >
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'relative z-[1] box-border flex size-5 shrink-0 items-center justify-center rounded-full border-2 bg-background',
        state === 'current' ? 'border-[hsl(14.8837_58.9041%_57.0588%)]' : 'border-border'
      )}
      style={state === 'current' ? { borderColor: PE3_ACCENT } : undefined}
    >
      {state === 'current' ? (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: PE3_ACCENT }}
        />
      ) : null}
    </span>
  );
}
