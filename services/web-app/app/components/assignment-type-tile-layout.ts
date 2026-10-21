import { cn } from '~/utils/misc';

/** Tiles v2: 56px mobile, 64px desktop (was 72 / 88). */
export const assignmentTypeTileImageClassName = 'h-14 w-full sm:h-16';

export function assignmentTypeTileCardClassName(extra?: string) {
  return cn(
    'flex flex-col overflow-hidden rounded-xl border text-left',
    extra
  );
}

export function assignmentTypeTileFooterClassName(extra?: string) {
  return cn(
    'flex items-center justify-between gap-2 px-3 py-2 sm:py-2.5',
    extra
  );
}
