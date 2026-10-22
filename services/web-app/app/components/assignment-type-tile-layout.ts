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
    'flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5 sm:py-2',
    extra
  );
}

export const assignmentTypeTileNameTestId = 'assignment-type-tile-name';
export const assignmentTypeTileMetaTestId = 'assignment-type-tile-meta';

export function assignmentTypeTileNameClassName(extra?: string) {
  return cn('min-w-0 flex-1 max-w-full text-left leading-snug', extra);
}

export function assignmentTypeTileMetaClassName(extra?: string) {
  return cn(
    'ml-auto shrink-0 whitespace-nowrap text-xs font-normal text-muted-foreground',
    extra
  );
}

export function assignmentTypeTileTrailingIconClassName(extra?: string) {
  return cn('shrink-0 self-baseline', extra);
}
