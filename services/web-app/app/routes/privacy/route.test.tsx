import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyRoute from './route';
import * as route from './route';

describe('privacy route', () => {
  test('is a public page with launch-ready privacy copy', () => {
    const html = renderToStaticMarkup(<PrivacyRoute />);

    expect('loader' in route).toBe(false);
    expect(html).toContain('Privacy Policy');
    expect('action' in route).toBe(false);
    expect(html).toContain('service providers');
    expect(html).not.toContain('does not sell');
    expect(html).not.toContain('as long as needed');
    expect(html).not.toContain('does not set a retention period');
    expect(html).toContain('automated feedback');
    expect(html).toContain('October 20, 2026');
    expect(html).toContain('Amazon Web Services');
    expect(html).toContain('Anthropic');
    expect(html).toContain('OpenAI');
    expect(html).toContain('PostHog');
    expect(html).toContain('Stripe');
    expect(html).toContain('7 days');
    expect(html).toContain('90 days');
    expect(html).toContain('train');
    expect(html).toContain('30 days');
    expect(html).toContain('72 hours');
    expect(html).not.toMatch(/\bAI\b/);
  });
});
