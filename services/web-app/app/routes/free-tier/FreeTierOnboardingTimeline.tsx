import { Check } from 'lucide-react';

export const ONBOARDING_TIMELINE_STEPS = [
  'Create your account',
  'Set up your class',
  'Ask your administrator',
  'Start teaching',
] as const;

/**
 * Presentation only; access continues to depend on the existing approval gate.
 * `current` counts from the class step (0 = set up your class) because the
 * account step is always done by the time a teacher sees this timeline.
 */
function onboardingTimelineLabel(
  step: (typeof ONBOARDING_TIMELINE_STEPS)[number],
  index: number,
  current: 0 | 1 | 2
) {
  if (index === 0 && current >= 1) return 'Account and class created';
  return step;
}

export function FreeTierOnboardingTimeline({
  current,
}: {
  current: 0 | 1 | 2;
}) {
  const active = current + 1;
  const last = ONBOARDING_TIMELINE_STEPS.length - 1;
  return (
    <ol
      aria-label="Onboarding progress"
      className="grid grid-cols-4 gap-1 text-center text-xs"
    >
      {ONBOARDING_TIMELINE_STEPS.map((step, index) => (
        <li
          key={step}
          aria-current={index === active ? 'step' : undefined}
          className={`relative flex flex-col items-center gap-2 ${index === active ? 'font-semibold text-card-foreground' : 'text-muted-foreground'}`}
        >
          {index < last ? (
            <span
              aria-hidden="true"
              className="absolute left-[calc(50%+14px)] right-[calc(-50%+10px)] top-3 h-px bg-border"
            />
          ) : null}
          <span
            aria-hidden="true"
            className={`flex h-6 w-6 items-center justify-center rounded-full border ${index <= active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}
          >
            {index < active ? <Check className="h-3.5 w-3.5" /> : index + 1}
          </span>
          <span>{onboardingTimelineLabel(step, index, current)}</span>
        </li>
      ))}
    </ol>
  );
}
