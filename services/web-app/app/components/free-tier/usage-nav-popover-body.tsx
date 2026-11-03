import type { RefObject } from 'react';
import type { UsageCount } from '~/domain/free-tier/inapp-usage';
import {
  usageNavFeatureLabel,
  usageNavLevelHeadline,
  usageNavPopoverDetail,
  type UsageNavFeature,
  type UsageNavLevel,
} from '~/domain/free-tier/usage-nav-meter';
import { FULL_ACCESS_CONTACT } from '~/components/free-account-usage';
import { cn } from '~/utils/misc';
import { UsageNavRingMiniSvg } from '~/components/free-tier/usage-nav-ring-svg';

type UsageNavPopoverBodyProps = {
  feature: UsageNavFeature;
  count: UsageCount;
  level: UsageNavLevel;
  renewsAtIso?: string;
  talkToUsRef?: RefObject<HTMLAnchorElement>;
  showFeatureLabel?: boolean;
};

export function UsageNavPopoverBody({
  feature,
  count,
  level,
  renewsAtIso,
  talkToUsRef,
  showFeatureLabel = true,
}: UsageNavPopoverBodyProps) {
  return (
    <>
      {showFeatureLabel ? (
        <p className="text-xs font-medium text-muted-foreground">
          {usageNavFeatureLabel(feature)}
        </p>
      ) : null}
      <p
        className={cn(
          'flex items-center gap-2 font-semibold',
          showFeatureLabel ? 'mt-1' : undefined
        )}
      >
        <UsageNavRingMiniSvg count={count} level={level} size={16} />
        {usageNavLevelHeadline(level, renewsAtIso)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {usageNavPopoverDetail({ feature, count, renewsAtIso })}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Unlimited with a site license.{' '}
        <a
          ref={talkToUsRef}
          href={FULL_ACCESS_CONTACT}
          className="text-primary underline"
          data-testid="usage-nav-talk-to-us"
        >
          Talk to us
        </a>
      </p>
    </>
  );
}
