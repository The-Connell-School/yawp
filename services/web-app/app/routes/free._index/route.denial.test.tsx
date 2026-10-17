import { afterAll, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';

// Keep the page and shared auth layout real; replace router state only.
const router = { ...(await import('react-router')) };
let error = 'cap_reached';
mock.module('react-router', () => ({
  ...router,
  useLoaderData: () => ({
    mode: 'token', token: 'fixture-event', tokenValid: { valid: true }, linkClosed: false,
  }),
  useFetcher: () => ({
    data: { ok: false, error },
    Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  }),
}));
const { default: FreeTierLanding } = await import('./route');
afterAll(() => mock.restore());

for (const [reason, message] of [
  ['cap_reached', 'This free classroom event is full.'],
  ['budget_exceeded', 'This event link is paused because the current free-tier budget has been reached.'],
]) {
  test(`${reason} keeps distinct feedback and waitlist navigation in the current auth layout`, () => {
    error = reason;
    const html = renderToStaticMarkup(<FreeTierLanding />);
    // Optional local browser evidence uses exactly the DOM asserted here.
    if (process.env.CAP_DENIAL_CAPTURE_PREFIX) {
      writeFileSync(`${process.env.CAP_DENIAL_CAPTURE_PREFIX}-${reason}.html`, html);
    }
    expect(html).toContain(message!);
    expect(html).toContain('href="/free"');
    expect(html).toContain('Join the waitlist');
    expect(html).toContain('name="token" value="fixture-event"');
    expect(html).toContain('Continue');
  });
}
