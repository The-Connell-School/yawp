import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import { FreeTierOnboardingTimeline } from './FreeTierOnboardingTimeline';

test('class step keeps Create your account on the timeline', () => {
  const html = renderToStaticMarkup(
    <FreeTierOnboardingTimeline current={0} />
  );
  expect(html).toContain('Create your account');
  expect(html).not.toContain('Account and class created');
});

test('administrator step labels the completed account step Account and class created', () => {
  const html = renderToStaticMarkup(
    <FreeTierOnboardingTimeline current={1} />
  );
  expect(html).toContain('Account and class created');
  expect(html).not.toContain('Create your account');
});
