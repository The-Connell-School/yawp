import type { ReactNode } from 'react';
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
export const dashboardAssignmentTileTestId = 'dashboard-assignment-tile';

/** v2 dashboard Assignments cards: text-only, ~117px-wide in a 3-col row (see design frames). */
export function dashboardAssignmentTileClassName(extra?: string) {
  return cn(
    'flex min-h-[92px] w-full flex-col overflow-hidden rounded-xl border bg-popover p-3 text-left shadow-sm',
    extra
  );
}

/** Name top-left, icon top-right; meta left-aligned on the row below (picker uses artwork tiles instead). */
export function DashboardAssignmentTileFooter({
  label,
  meta,
  metaClassName,
  trailing,
}: {
  label: string;
  meta?: ReactNode;
  metaClassName?: string;
  trailing: ReactNode;
}) {
  return (
    <>
      <div className="flex w-full min-w-0 items-start justify-between gap-2">
        <span
          className="min-w-0 flex-1 text-left text-[15px] font-medium leading-snug"
          data-testid={assignmentTypeTileNameTestId}
        >
          {label}
        </span>
        <span className="shrink-0 self-start leading-none">{trailing}</span>
      </div>
      {meta != null && meta !== '' ? (
        <span
          className={cn(
            'mt-1 block text-left text-[13px] font-normal leading-snug text-muted-foreground',
            metaClassName
          )}
          data-testid={assignmentTypeTileMetaTestId}
        >
          {meta}
        </span>
      ) : null}
    </>
  );
}

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
