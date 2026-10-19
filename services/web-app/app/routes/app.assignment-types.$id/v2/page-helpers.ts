import { formatDateOnly } from '~/utils/date-only';
import {
  formatClassCardTitle,
  type ClassDisplayFields,
} from '~/utils/class-display';

export function menuState({
  hasClasses,
  library,
  generator,
  apHistory,
}: {
  hasClasses: boolean;
  library: boolean;
  generator: boolean;
  apHistory: boolean;
}) {
  if (!hasClasses) return 'no-classes';
  if (apHistory) return 'ap-history';
  if (library) return generator ? 'library-generator' : 'library';
  return 'plain';
}
export function assignmentClassLabel(classes: ClassDisplayFields[]) {
  if (!classes.length) return '';
  const periods = [
    ...new Set(classes.map((c) => String(c.period ?? '').trim())),
  ];
  if (periods.every(Boolean)) {
    if (periods.length === 1) return `Period ${periods[0]}`;
    return `Periods ${periods.slice(0, -1).join(', ')} and ${periods.at(-1)}`;
  }
  return [...new Set(classes.map(formatClassCardTitle))].join(', ');
}
export function assignmentDueLabel(
  dates: (string | Date | null)[],
  timeZone: string
) {
  const times = dates
    .filter((d): d is string | Date => d != null)
    .map((d) => new Date(d).getTime())
    .filter(Number.isFinite);
  if (!times.length) return '';
  return `Due ${formatDateOnly(new Date(Math.min(...times)), 'en-US', {
    month: 'short',
    day: 'numeric',
    year: undefined,
    timeZone,
  })}`;
}
