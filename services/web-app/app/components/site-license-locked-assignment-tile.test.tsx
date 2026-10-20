import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteLicenseLockedAssignmentTile } from './site-license-locked-assignment-tile';
import { SITE_LICENSE_UNAVAILABLE_REASON } from '~/domain/free-tier/site-license-message';

test('locked dashboard tile is not actionable and explains the site license', () => {
  const html = renderToStaticMarkup(
    <SiteLicenseLockedAssignmentTile
      label="Daily Pages"
      variant="dashboard"
    />
  );
  expect(html).toContain('aria-disabled="true"');
  expect(html).toContain(SITE_LICENSE_UNAVAILABLE_REASON);
  expect(html).toContain('Daily Pages');
  expect(html).not.toContain('<button');
});

test('locked picker tile exposes the same explanation to assistive tech', () => {
  const html = renderToStaticMarkup(
    <SiteLicenseLockedAssignmentTile
      label="AP History Essay"
      variant="picker"
    />
  );
  expect(html).toContain(`AP History Essay. ${SITE_LICENSE_UNAVAILABLE_REASON}`);
});
