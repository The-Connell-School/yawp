import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import TermsRoute from './route';
import * as route from './route';

describe('terms route', () => {
  test('is a public page with launch-ready terms copy', () => {
    const html = renderToStaticMarkup(<TermsRoute />);

    expect('loader' in route).toBe(false);
    expect('action' in route).toBe(false);
    expect(html).toContain('Terms of Service');
    expect(html).toContain('Free classroom access');
    expect(html).toContain('automated feedback');
  });
});
