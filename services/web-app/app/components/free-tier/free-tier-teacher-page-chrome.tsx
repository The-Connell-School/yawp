import type { ReactNode } from 'react';
import { useFreeAccountUsage } from '~/components/free-account-usage';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { cn } from '~/utils/misc';

export function useFreeTierLockedB2PageChrome() {
  const freeUsage = useFreeAccountUsage();
  const { locked } = useTeachingAccess();
  return Boolean(freeUsage && locked);
}

/** Shared main-column inset for all standard /app pages under `[data-free-account]`. */
export function useFreeTierStandardPageShell() {
  return Boolean(useFreeAccountUsage());
}

export function freeTierStandardPageShellClassName(extra?: string) {
  return freeTierLockedPageOuterClassName(extra);
}

export function freeTierStandardPageBodyClassName(extra?: string) {
  return freeTierLockedPageBodyClassName(extra);
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

export function freeTierLockedPageBodyClassName(extra?: string) {
  return cn('free-tier-b2-page-body mx-auto w-full min-w-0 flex-1', extra);
}
