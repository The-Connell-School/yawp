import { cn } from '~/utils/misc';

/** Tiles v2: 56px mobile, 64px desktop (was 72 / 88). */
export const assignmentTypeTileImageClassName = 'h-14 w-full sm:h-16';

export function assignmentTypeTileCardClassName(extra?: string) {
  return cn(
    'flex h-auto w-full flex-col self-start overflow-hidden rounded-xl border text-left',
    extra
  );
}

export function assignmentTypeTileImageWrapClassName(extra?: string) {
  return cn('shrink-0 overflow-hidden', extra);
}

export function assignmentTypeTileFooterClassName(extra?: string) {
  return cn(
    'grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-2 gap-y-0.5 px-3 py-1.5 sm:py-2',
    extra
  );
}

export const assignmentTypeTileNameTestId = 'assignment-type-tile-name';

export function assignmentTypeTileNameClassName(extra?: string) {
  return cn('min-w-0 text-left leading-snug', extra);
}

export function assignmentTypeTileMetaClassName(extra?: string) {
  return cn(
    'shrink-0 self-start whitespace-nowrap text-xs font-normal text-muted-foreground',
    extra
  );
}
