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
    expect(html).toContain('AI-assisted feedback');
  });
});
