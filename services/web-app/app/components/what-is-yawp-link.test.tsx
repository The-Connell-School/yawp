import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  WHAT_IS_YAWP_HREF,
  WHAT_IS_YAWP_LABEL,
  WhatIsYawpLink,
} from './what-is-yawp-link';

test('What is Yawp! opens the writing program site in a new tab', () => {
  const html = renderToStaticMarkup(
    <WhatIsYawpLink className="underline underline-offset-2" />
  );
  expect(html).toContain(`>${WHAT_IS_YAWP_LABEL}<`);
  expect(html).toContain(`href="${WHAT_IS_YAWP_HREF}"`);
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener"');
  expect(html).toContain('class="underline underline-offset-2"');
  expect(html).not.toContain('sparkle');
});
