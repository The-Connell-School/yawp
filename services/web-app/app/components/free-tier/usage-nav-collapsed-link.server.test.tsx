import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { UsageNavCollapsedLink } from '~/components/free-tier/usage-nav-collapsed-link';

test('collapsed link uses 44px hit target and frame 08 aria label', () => {
  const html = renderToStaticMarkup(
    <StaticRouter location="/app">
      <UsageNavCollapsedLink
        to="/app/lesson-planner"
        feature="lesson-planner"
        icon={<span>icon</span>}
        count={{ used: 8, total: 10, remaining: 2 }}
        renewsAtIso="2026-11-01T00:00:00.000Z"
      />
    </StaticRouter>
  );
  expect(html).toContain('size-11');
  expect(html).toContain('aria-label="Lesson Planner, A few left"');
  expect(html).toContain('data-testid="usage-nav-collapsed-link-lesson-planner"');
});
