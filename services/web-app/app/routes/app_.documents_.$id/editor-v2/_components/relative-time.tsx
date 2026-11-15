import { useEffect, useState } from 'react';
import { timeAgo } from '~/utils/timeAgo';

type Props = {
  value: Date | string;
  className?: string;
};

/** Renders relative time client-only to avoid SSR hydration mismatches. */
export function RelativeTime({ value, className }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setLabel(timeAgo(new Date(value)));
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, [value]);

  return (
    <span className={className} suppressHydrationWarning>
      {label ?? '\u00a0'}
    </span>
  );
}