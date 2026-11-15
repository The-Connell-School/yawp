import { useEffect, useState } from 'react';
import { timeAgo } from '~/utils/timeAgo';
import { scheduleAfterHydration } from '../utils/schedule-after-hydration';

type Props = {
  value: Date | string;
  className?: string;
};

/** Renders relative time client-only to avoid SSR hydration mismatches. */
export function RelativeTime({ value, className }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setLabel(timeAgo(new Date(value)));
    scheduleAfterHydration(refresh);
    const id = window.setInterval(() => scheduleAfterHydration(refresh), 60_000);
    return () => window.clearInterval(id);
  }, [value]);

  return (
    <span className={className} suppressHydrationWarning>
      {label ?? '\u00a0'}
    </span>
  );
}