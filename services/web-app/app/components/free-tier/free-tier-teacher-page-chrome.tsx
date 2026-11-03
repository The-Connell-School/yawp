import type { ReactNode } from 'react';
import { useUser } from '~/hooks/useUser';
import { cn } from '~/utils/misc';

function useTeacherAppPageChrome() {
  return useUser().selectedMembership?.role === 'TEACHER';
}

/** B2 page chrome (plain title, no gray bar) for teacher /app pages — free, locked preview, or licensed. */
export function useFreeTierLockedB2PageChrome() {
  return useTeacherAppPageChrome();
}

/** Shared max-width shell for standard teacher /app pages. */
export function useFreeTierStandardPageShell() {
  return useTeacherAppPageChrome();
}

export function freeTierStandardPageShellClassName(extra?: string) {
  return freeTierLockedPageOuterClassName(extra);
}

export type FreeTierPageBodyWidth = 'standard' | 'reading';

function freeTierPageBodyExtraHasMaxWidth(extra?: string) {
  if (!extra) return false;
  return /\bmax-w-/.test(extra);
}

export function freeTierStandardPageBodyClassName(
  extra?: string,
  opts?: { width?: FreeTierPageBodyWidth }
) {
  return freeTierLockedPageBodyClassName(extra, opts);
}

export function FreeTierLockedPageHeader({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className="free-tier-b2-page-header flex flex-wrap items-center justify-between gap-3"
      data-testid="free-tier-b2-page-header"
    >
      <h1 className="m-0 text-[24px] font-bold leading-tight text-[#0f172a]">
        {title}
      </h1>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function freeTierLockedPageOuterClassName(extra?: string) {
  return cn('free-tier-b2-page-shell no-scrollbar flex h-full w-full flex-col overflow-y-scroll', extra);
}

export function freeTierLockedPageBodyClassName(
  extra?: string,
  opts?: { width?: FreeTierPageBodyWidth }
) {
  const width = opts?.width ?? 'standard';
  const widthClass = freeTierPageBodyExtraHasMaxWidth(extra)
    ? undefined
    : width === 'reading'
      ? 'max-w-screen-md'
      : 'max-w-screen-xl';

  return cn(
    'free-tier-b2-page-body mx-auto w-full min-w-0 flex-1',
    widthClass,
    extra
  );
}
