import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UsageNavMonthlyUsagePopover,
  UsageNavPopoverBody,
} from '~/components/free-tier/usage-nav-popover-body';

const count = (remaining: number, total: number) => ({
  used: total - remaining,
  total,
  remaining,
});

describe('UsageNavMonthlyUsagePopover', () => {
  test('renders title, one renews line, rows, and Need more footer', () => {
    const html = renderToStaticMarkup(
      <UsageNavMonthlyUsagePopover
        renewsAtIso="2026-11-01T00:00:00.000Z"
        rows={[
          {
            feature: 'lesson-planner',
            count: count(80, 100),
            level: 'plenty',
          },
          {
            feature: 'reporter',
            count: count(2, 10),
            level: 'few',
          },
        ]}
      />
    );
    expect(html).toContain('Usage this month');
    expect(html).toContain('Renews Nov 1');
    expect(html.match(/Renews Nov 1/g)?.length).toBe(1);
    expect(html).toContain('Lesson Planner');
    expect(html).toContain('Reporter');
    expect(html).toContain('Plenty left');
    expect(html).toContain('A few left');
    expect(html).toContain('Need more?');
    expect(html).toContain('data-testid="usage-nav-talk-to-us"');
    expect(html).not.toContain('Unlimited with a site license');
    expect(html).toContain('h-[3px]');
    expect(html).toContain('font-bold text-primary');
    expect(html).toContain('font-normal text-muted-foreground');
  });
});

describe('UsageNavPopoverBody', () => {
  test('single-feature body drops site-license prose', () => {
    const html = renderToStaticMarkup(
      <UsageNavPopoverBody
        feature="lesson-planner"
        count={count(0, 5)}
        level="all-used"
      />
    );
    expect(html).toContain('All used');
    expect(html).toContain('font-semibold text-primary');
    expect(html).not.toContain('Unlimited with a site license');
    expect(html).not.toContain('Renews');
    expect(html).not.toContain('aria-valuetext');
  });
});
