import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import { FreeTierOnboardingTimeline } from './FreeTierOnboardingTimeline';

test('class step shows compact two-step timeline in its own card', () => {
  const html = renderToStaticMarkup(
    <FreeTierOnboardingTimeline current={0} />
  );
  expect(html).toContain('free-tier-setup-timeline-card');
  expect(html).toContain('Let’s set up your classroom');
  expect(html).toContain('Administrator approval');
  expect(html).toContain('aria-current="step"');
  expect(html).not.toContain('Create your account');
});

test('administrator step marks classroom setup complete', () => {
  const html = renderToStaticMarkup(
    <FreeTierOnboardingTimeline current={1} />
  );
  expect(html).toContain('Administrator approval');
  expect(html.match(/aria-current="step"/g)?.length).toBe(1);
});
