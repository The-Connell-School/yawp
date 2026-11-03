import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { AuthPageShell } from './auth-brand-lockup';

mock.module('~/hooks/useUser', () => ({
  useOptionalUser: () => undefined,
}));

mock.module('~/hooks/useRequestInfo', () => ({
  useRequestInfo: () => ({ origin: 'https://yawp.school', path: '/free' }),
}));

describe('AuthPageShell card chrome', () => {
  test('renders a homepage logo link and back link on /free when signed out', () => {
    const markup = renderToStaticMarkup(
      <StaticRouter location="/free">
        <AuthPageShell>
          <p>card</p>
        </AuthPageShell>
      </StaticRouter>
    );

    expect(markup).toContain('href="https://yawp.school"');
    expect(markup).toContain('aria-label="Yawp! home"');
    expect(markup).toContain('href="/auth/login"');
    expect(markup).toContain('Back to sign in');
  });

  test('hides the back link on /auth/login', () => {
    const markup = renderToStaticMarkup(
      <StaticRouter location="/auth/login">
        <AuthPageShell>
          <p>card</p>
        </AuthPageShell>
      </StaticRouter>
    );

    expect(markup).not.toContain('Back to sign in');
  });
});
