import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoutesStub } from 'react-router';
import { UaPartnerEntry } from './ua-partner-entry';

function render(authenticated: boolean) {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <UaPartnerEntry
          authenticated={authenticated}
          codeAccepted={false}
          loginHref="/auth?mode=login"
          signupHref="/ua/sign-up"
        />
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={['/']} />);
}

describe('UA partner entry copy', () => {
  test('a signed-in visitor is asked to continue to Yawp!', () => {
    const markup = render(true);
    expect(markup).toContain('Continue to Yawp!</h1>');
    expect(markup).not.toMatch(/\bYawp\b(?!!)/);
  });
});
