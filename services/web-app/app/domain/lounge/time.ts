const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short "3h ago" style label. Computed on the server so it never mismatches on hydration. */
export function formatLoungeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return 'yesterday';
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  const date = `${MONTHS[then.getUTCMonth()]} ${then.getUTCDate()}`;
  return then.getUTCFullYear() === now.getUTCFullYear() ? date : `${date}, ${then.getUTCFullYear()}`;
}
