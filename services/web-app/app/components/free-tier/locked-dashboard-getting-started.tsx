import { LOCKED_DASHBOARD_GETTING_STARTED_TITLE } from '~/domain/free-tier/locked-dashboard-copy';
import { FreeTierGettingStartedTimeline } from '~/components/free-tier/free-tier-getting-started-timeline';

const STEPS = [
  { key: 'awaiting', label: 'Awaiting administrative approval', current: true },
  { key: 'approved', label: 'Administrator approved', current: false },
  { key: 'invite', label: 'Invite students', current: false },
  { key: 'assignment', label: 'Create your first assignment', current: false },
] as const;

export function LockedDashboardGettingStarted() {
  const currentIndex = STEPS.findIndex((step) => step.current);
  const stepNumber = currentIndex >= 0 ? currentIndex + 1 : 1;

  return (
    <FreeTierGettingStartedTimeline
      title={LOCKED_DASHBOARD_GETTING_STARTED_TITLE}
      progressLabel={`Step ${stepNumber} of ${STEPS.length}`}
      testId="locked-dashboard-getting-started"
      steps={STEPS.map((step) => ({
        key: step.key,
        label: step.label,
        state: step.current ? 'current' : 'upcoming',
      }))}
    />
  );
}
