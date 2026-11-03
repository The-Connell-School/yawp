import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsageNavRing } from '~/components/free-tier/usage-nav-ring';

test('mobile drawer ring trigger uses 44px hit target', () => {
  const html = renderToStaticMarkup(
    <UsageNavRing
      feature="lesson-planner"
      variant="mobile-drawer"
      count={{ used: 8, total: 10, remaining: 2 }}
      renewsAtIso="2026-11-01T00:00:00.000Z"
    />
  );
  expect(html).toContain('size-11');
  expect(html).toContain('data-testid="usage-nav-ring-lesson-planner"');
});
