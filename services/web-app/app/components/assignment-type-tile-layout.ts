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
    'flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5 px-3 py-1.5 sm:py-2',
    extra
  );
}

export function assignmentTypeTileNameClassName(extra?: string) {
  return cn(
    'min-w-0 flex-1 basis-[40%] text-left leading-snug break-words',
    extra
  );
}

export function assignmentTypeTileMetaClassName(extra?: string) {
  return cn(
    'max-w-[45%] shrink-0 self-start text-right text-xs font-normal leading-snug text-muted-foreground',
    extra
  );
}
