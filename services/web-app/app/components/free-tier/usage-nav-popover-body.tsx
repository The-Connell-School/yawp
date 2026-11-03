import type { RefObject } from 'react';
import type { UsageCount } from '~/domain/free-tier/inapp-usage';
import {
  usageNavFeatureLabel,
  usageNavLevelPopoverStatus,
  usageNavProgressBarTerracotta,
  usageNavRenewsHeaderLabel,
  usagePercentUsed,
  type UsageNavFeature,
  type UsageNavLevel,
} from '~/domain/free-tier/usage-nav-meter';
import { FULL_ACCESS_CONTACT } from '~/components/free-account-usage';
import { cn } from '~/utils/misc';

const usageNavTrackClassName =
  'h-[3px] w-full overflow-hidden rounded-full bg-[hsl(51.4286_16%_90%)]';

function usageNavRowStatusClassName(level: UsageNavLevel): string {
  if (level === 'few') {
    return 'shrink-0 text-sm font-bold text-primary';
  }
  if (level === 'all-used') {
    return 'shrink-0 text-sm font-semibold text-primary';
  }
  return 'shrink-0 text-sm font-normal text-muted-foreground';
}

type UsageNavUsageRowProps = {
  feature: UsageNavFeature;
  count: UsageCount;
  level: UsageNavLevel;
};

export function UsageNavUsageRow({ feature, count, level }: UsageNavUsageRowProps) {
  const status = usageNavLevelPopoverStatus(level);
  const usedPercent = usagePercentUsed(count);
  const terracottaBar = usageNavProgressBarTerracotta(level);

  return (
    <div className="space-y-1.5" data-testid={`usage-nav-row-${feature}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-normal text-foreground">
          {usageNavFeatureLabel(feature)}
        </span>
        <span className={usageNavRowStatusClassName(level)}>{status}</span>
      </div>
      <div
        className={usageNavTrackClassName}
        role="progressbar"
        aria-valuenow={usedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${usageNavFeatureLabel(feature)} ${status}`}
      >
        <div
          className={cn(
            'h-full rounded-full',
            terracottaBar ? 'bg-primary' : 'bg-foreground'
          )}
          style={{ width: `${Math.min(100, Math.max(0, usedPercent))}%` }}
        />
      </div>
    </div>
  );
}

export function UsageNavPopoverFooter({
  talkToUsRef,
}: {
  talkToUsRef?: RefObject<HTMLAnchorElement>;
}) {
  return (
    <p className="mt-3 border-t border-[hsl(51.4286_7.8652%_82.549%)] pt-3 text-sm text-primary">
      Need more?{' '}
      <a
        ref={talkToUsRef}
        href={FULL_ACCESS_CONTACT}
        className="underline underline-offset-2"
        data-testid="usage-nav-talk-to-us"
      >
        Talk to us
      </a>
    </p>
  );
}

export type UsageNavMonthlyUsagePopoverProps = {
  renewsAtIso?: string;
  rows: Array<{
    feature: UsageNavFeature;
    count: UsageCount;
    level: UsageNavLevel;
  }>;
  talkToUsRef?: RefObject<HTMLAnchorElement>;
};

export function UsageNavMonthlyUsagePopover({
  renewsAtIso,
  rows,
  talkToUsRef,
}: UsageNavMonthlyUsagePopoverProps) {
  return (
    <div className="text-sm" data-testid="usage-nav-monthly-popover">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-foreground">
          Usage this month
        </p>
        {renewsAtIso ? (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {usageNavRenewsHeaderLabel(renewsAtIso)}
          </span>
        ) : null}
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <UsageNavUsageRow
            key={row.feature}
            feature={row.feature}
            count={row.count}
            level={row.level}
          />
        ))}
      </div>
      <UsageNavPopoverFooter talkToUsRef={talkToUsRef} />
    </div>
  );
}

type UsageNavPopoverBodyProps = {
  feature: UsageNavFeature;
  count: UsageCount;
  level: UsageNavLevel;
  renewsAtIso?: string;
  talkToUsRef?: RefObject<HTMLAnchorElement>;
  showFeatureLabel?: boolean;
};

/** Single-feature popover (nav ring / collapsed link / mobile sheet body). */
export function UsageNavPopoverBody({
  feature,
  count,
  level,
  talkToUsRef,
}: UsageNavPopoverBodyProps) {
  return (
    <div className="text-sm">
      <UsageNavUsageRow feature={feature} count={count} level={level} />
      <UsageNavPopoverFooter talkToUsRef={talkToUsRef} />
    </div>
  );
}
