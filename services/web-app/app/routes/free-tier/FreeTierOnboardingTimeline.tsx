import type { ReactNode } from 'react';
import { CircularProgress } from '~/components/ui/circular-progress';

const SETUP_TIMELINE_STEPS = [
  'Let’s set up your classroom',
  'Administrator approval',
] as const;

/**
 * Compact two-step timeline for class setup and administrator onboarding.
 * Sits in its own card above the form card (~56px tall).
 */
export function FreeTierOnboardingTimeline({
  current,
}: {
  current: 0 | 1;
}) {
  const items: ReactNode[] = [];
  SETUP_TIMELINE_STEPS.forEach((label, index) => {
    const isComplete = index < current;
    const isCurrent = index === current;
    const progress = isComplete ? 100 : isCurrent ? 50 : 0;
    items.push(
      <li
        key={label}
        className={
          isCurrent
            ? 'free-tier-setup-timeline-step free-tier-setup-timeline-step-now'
            : 'free-tier-setup-timeline-step free-tier-setup-timeline-step-next'
        }
        aria-current={isCurrent ? 'step' : undefined}
      >
        <CircularProgress progress={progress} index={index + 1} size="sm" />
        <span>{label}</span>
      </li>
    );
    if (index < SETUP_TIMELINE_STEPS.length - 1) {
      items.push(
        <li
          key={`line-${index}`}
          className="free-tier-setup-timeline-line"
          aria-hidden="true"
        />
      );
    }
  });

  return (
    <div className="free-tier-setup-timeline-card">
      <ol aria-label="Setup steps" className="free-tier-setup-timeline">
        {items}
      </ol>
    </div>
  );
}

/** @deprecated Kept for tests referencing step names; timeline UI is two-step only. */
export const ONBOARDING_TIMELINE_STEPS = [
  'Create your account',
  'Set up your class',
  'Ask your administrator',
  'Start teaching',
] as const;
