import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import { HorizontalScroll } from '~/components/ui/horizontal-scroll';

export type ScrollTab = {
  to: string;
  label: string;
  icon: ReactNode;
};

/**
 * Icon-and-label section links (admin, organization). Each tab keeps its
 * icon in its own slot before the label, sizes to that content, and scrolls
 * with edge arrows when the row overflows.
 */
export function ScrollTabBar({
  tabs,
  activeTo,
  ariaLabel,
  testId,
  labelFor,
  ...rest
}: {
  tabs: ScrollTab[];
  activeTo?: string;
  ariaLabel: string;
  testId?: string;
  labelFor?: (tab: ScrollTab) => string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'role'>) {
  return (
    <HorizontalScroll
      {...rest}
      testId={testId}
      ariaLabel={ariaLabel}
      itemCount={tabs.length}
      revealSelector='[aria-current="page"]'
      revealKey={activeTo ?? ''}
      trackClassName="gap-1"
      fadeFromClassName="from-background"
    >
      {tabs.map((tab) => {
        const active = tab.to === activeTo;
        const label = labelFor ? labelFor(tab) : tab.label;
        return (
          <Button
            key={tab.to}
            type="button"
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            className="shrink-0"
            asChild
          >
            <Link to={tab.to} aria-current={active ? 'page' : undefined}>
              {tab.icon}
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          </Button>
        );
      })}
    </HorizontalScroll>
  );
}
