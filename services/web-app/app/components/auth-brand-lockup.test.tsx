import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthBrandLockup } from './auth-brand-lockup';

describe('authentication brand lockup', () => {
  test('shows only the official Alabama nameplate, a plus, and Yawp in UA context', () => {
    const markup = renderToStaticMarkup(<AuthBrandLockup partner="ua" />);

    expect(markup).toContain('university-of-alabama-nameplate.png');
    expect(markup).toContain('yawp_black_logo.png');
    expect(markup).toContain('+');
    expect(markup).not.toContain('crimson');
  });

  test('keeps the existing Yawp-only logo outside UA context', () => {
    const markup = renderToStaticMarkup(<AuthBrandLockup />);

    expect(markup).toContain('logo_for_light_mode.png');
    expect(markup).not.toContain('university-of-alabama');
  });
});
