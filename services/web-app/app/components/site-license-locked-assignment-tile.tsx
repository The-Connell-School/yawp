import { Lock } from 'lucide-react';
import { SITE_LICENSE_UNAVAILABLE_REASON } from '~/domain/free-tier/site-license-message';
import { cn } from '~/utils/misc';

type SiteLicenseLockedAssignmentTileProps = {
  label: string;
  /** `dashboard` matches FreeAssignmentTiles; `picker` matches the creation sheet list. */
  variant: 'dashboard' | 'picker';
  className?: string;
};

export function SiteLicenseLockedAssignmentTile({
  label,
  variant,
  className,
}: SiteLicenseLockedAssignmentTileProps) {
  const explanationId = `site-license-lock-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const shared = (
    <>
      <span
        className={cn(
          'flex w-full items-start justify-between gap-2 font-medium',
          variant === 'dashboard' && 'text-[15px]'
        )}
      >
        {label}
        <Lock size={16} className="mt-1 shrink-0 text-muted-foreground" />
      </span>
      <span
        id={explanationId}
        className="text-[13px] text-muted-foreground"
      >
        {SITE_LICENSE_UNAVAILABLE_REASON}
      </span>
    </>
  );

  if (variant === 'picker') {
    return (
      <div
        role="group"
        aria-disabled="true"
        aria-label={`${label}. ${SITE_LICENSE_UNAVAILABLE_REASON}`}
        aria-describedby={explanationId}
        data-testid="site-license-locked-assignment-tile"
        className={cn(
          'flex min-h-[60px] w-full cursor-not-allowed items-center gap-3 rounded-lg p-3 text-left text-sm text-muted-foreground opacity-70',
          className
        )}
      >
        <span className="w-4 shrink-0" aria-hidden="true" />
        <span className="flex flex-1 flex-col gap-1">{shared}</span>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-disabled="true"
      aria-label={`${label}. ${SITE_LICENSE_UNAVAILABLE_REASON}`}
      aria-describedby={explanationId}
      data-testid="site-license-locked-assignment-tile"
      className={cn(
        'flex min-h-[92px] cursor-not-allowed flex-col gap-1.5 rounded-xl border bg-muted/30 p-3.5 text-left opacity-80',
        className
      )}
    >
      {shared}
    </div>
  );
}
