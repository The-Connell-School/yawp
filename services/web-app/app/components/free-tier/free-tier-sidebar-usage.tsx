import { useState } from 'react';
import { ChartColumn, ChevronDown, ChevronRight } from 'lucide-react';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import {
  usageMeterRenewsLabel,
  usageMeterRows,
  type UsageMeterRow,
} from '~/domain/free-tier/usage-nav-meter';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { FULL_ACCESS_CONTACT } from '~/components/free-account-usage';
import { cn } from '~/utils/misc';

// Colors sampled from the approved Meter A frames (Claude Design, Nov 2).
const METER_WARN = 'text-[#B35333]';
const trackClassName =
  'h-[3px] w-full overflow-hidden rounded-full bg-[#E6E2D6]';

function UsageMeterRowView({ row }: { row: UsageMeterRow }) {
  return (
    <div className="space-y-2" data-testid={`usage-meter-row-${row.feature}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-normal text-[#1B1B1B]">{row.label}</span>
        <span
          className={cn(
            'shrink-0 text-sm',
            row.level === 'few'
              ? `font-bold ${METER_WARN}`
              : row.level === 'all-used'
                ? 'font-medium text-[#3C3828]'
                : 'font-normal text-[#3C3828]'
          )}
        >
          {row.status}
        </span>
      </div>
      <div
        className={trackClassName}
        role="progressbar"
        aria-valuenow={row.percentLeft}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${row.label}: ${row.status}`}
      >
        <div
          className={cn(
            'h-full rounded-full',
            row.level === 'few' ? 'bg-[#B35333]' : 'bg-[#1F3532]'
          )}
          style={{ width: `${row.percentLeft}%` }}
        />
      </div>
    </div>
  );
}

/** "Usage this month" card: Meter A body, shared by the popover and the mobile drawer. */
export function UsageThisMonth({
  rows,
  renewsAtIso,
}: {
  rows: UsageMeterRow[];
  renewsAtIso?: string;
}) {
  return (
    <div className="text-sm" data-testid="usage-meter-body">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-[#0F172A]">
          Usage this month
        </p>
        {renewsAtIso ? (
          <span className="shrink-0 text-xs font-normal text-[#5E5D5A]">
            {usageMeterRenewsLabel(renewsAtIso)}
          </span>
        ) : null}
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <UsageMeterRowView key={row.feature} row={row} />
        ))}
      </div>
      <p
        className={`mt-3 border-t border-[#D6D5CF] pt-3 text-sm ${METER_WARN}`}
      >
        Need more?{' '}
        <a
          href={FULL_ACCESS_CONTACT}
          className={`underline underline-offset-2 ${METER_WARN}`}
          data-testid="usage-meter-talk-to-us"
        >
          Talk to us
        </a>
      </p>
    </div>
  );
}

/**
 * Meter A: a "Usage" row at the bottom of the free-tier sidebar. On desktop it
 * opens a small popover to the right; in the mobile drawer it opens in place.
 * Free-tier only; licensed teachers never get `freeAccountUsage`.
 */
export function FreeTierSidebarUsage({
  usage,
  navExpanded,
  mobileDrawer,
  lessonPlannerAvailable,
  loading,
}: {
  usage: FreeAccountUsage;
  navExpanded: boolean;
  mobileDrawer: boolean;
  lessonPlannerAvailable: boolean;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rows = usageMeterRows(usage, { lessonPlannerAvailable });
  if (rows.length === 0) return null;

  const label = (
    <>
      <ChartColumn size={18} className="size-[17px] shrink-0" aria-hidden />
      {navExpanded ? (
        <span className="min-w-0 flex-1 text-left">Usage</span>
      ) : null}
    </>
  );
  const rowClassName = cn(
    'app-nav-footer-action flex w-full items-center gap-2 text-left transition',
    open && 'bg-[#E6E2D6]',
    loading && 'opacity-60'
  );

  if (mobileDrawer) {
    return (
      <div data-testid="free-tier-sidebar-usage-mobile">
        <button
          type="button"
          aria-expanded={open}
          aria-label="Usage"
          data-testid="free-tier-sidebar-usage"
          data-nav-expanded={navExpanded ? '' : undefined}
          onClick={() => setOpen((value) => !value)}
          className={rowClassName}
        >
          {label}
          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              'shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
        {open ? (
          <div className="mx-3 mb-3 rounded-[10px] border border-[#D6D5CF] bg-white p-4">
            <UsageThisMonth rows={rows} renewsAtIso={usage.renewsAt} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Usage"
          data-testid="free-tier-sidebar-usage"
          data-nav-expanded={navExpanded ? '' : undefined}
          className={rowClassName}
        >
          {label}
          {navExpanded ? (
            <ChevronRight
              size={16}
              aria-hidden
              className="shrink-0 text-muted-foreground"
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={10}
        collisionPadding={8}
        aria-label="Usage this month"
        className="w-[260px] rounded-[10px] border border-[#E6E2D6] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.12)]"
      >
        <UsageThisMonth rows={rows} renewsAtIso={usage.renewsAt} />
      </PopoverContent>
    </Popover>
  );
}
