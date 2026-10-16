import { Check } from 'lucide-react';

/** Presentation only; access continues to depend on the existing approval gate. */
export function FreeTierOnboardingTimeline({
  current,
}: {
  current: 0 | 1 | 2;
}) {
  return (
    <ol
      aria-label="Onboarding progress"
      className="grid grid-cols-3 gap-1 text-center text-xs"
    >
      {['Create your class', 'Ask your administrator', 'Start teaching'].map(
        (step, index) => (
          <li
            key={step}
            aria-current={index === current ? 'step' : undefined}
            className={`relative flex flex-col items-center gap-2 ${index === current ? 'font-semibold text-card-foreground' : 'text-muted-foreground'}`}
          >
            {index < 2 ? (
              <span
                aria-hidden="true"
                className="absolute left-[calc(50%+14px)] right-[calc(-50%+10px)] top-3 h-px bg-border"
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 items-center justify-center rounded-full border ${index <= current ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}
            >
              {index < current ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span>{step}</span>
          </li>
        )
      )}
    </ol>
  );
}
