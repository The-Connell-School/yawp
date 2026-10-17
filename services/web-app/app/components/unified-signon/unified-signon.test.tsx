import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { UnifiedSignon } from './unified-signon';

const transport = async () => ({ ok: true }) as never;
const render = (props: {
  googleAvailable?: boolean;
  googleVisible?: boolean;
}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <UnifiedSignon transport={transport} {...props} />
    </MemoryRouter>
  );

test('entry shows Continue with Google by default, as on demo and production', () => {
  expect(render({ googleAvailable: true })).toContain('Continue with Google');
  // Unconfigured credentials still render the disabled button, unchanged.
  expect(render({ googleAvailable: false })).toContain('Continue with Google');
});
test('a preview origin that is not registered with Google hides the button and divider', () => {
  const html = render({ googleAvailable: false, googleVisible: false });
  expect(html).not.toContain('Continue with Google');
  expect(html).not.toContain('signon-divider');
  expect(html).toContain('Email or class code');
});
