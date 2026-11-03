import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SiteLicenseLockedAssignmentTile,
} from './site-license-locked-assignment-tile';
import { SITE_LICENSE_UNAVAILABLE_REASON } from '~/domain/free-tier/site-license-message';

test('locked picker tile exposes lock button without visible explanation line', () => {
  const html = renderToStaticMarkup(
    <SiteLicenseLockedAssignmentTile
      label="AP History Essay"
      variant="picker"
    />
  );
  expect(html).toContain('AP History Essay');
  expect(html).not.toContain(SITE_LICENSE_UNAVAILABLE_REASON);
  expect(html).toContain('site-license-lock-button');
});
