import { afterAll, expect, mock, test } from 'bun:test';
import {
  mockCardPageChromeForSsr,
  renderWithCardPageChrome,
} from '~/components/card-page-chrome.ssr-test-setup';

mock.module('./useFreeTierLayoutContext', () => ({
  useFreeTierEnabled: () => true,
}));

mockCardPageChromeForSsr({ signedIn: false });

const { AdminLinkReplacedCard } = await import('./AdminApprovalStates');
const { linkReplacedBody } = await import('~/domain/free-tier/admin-approval-copy');

afterAll(() => mock.restore());

test('link replaced card uses designed title and body copy', () => {
  const html = renderWithCardPageChrome(
    <AdminLinkReplacedCard
      teacherName="Jordan Rivera"
      schoolName="Lincoln High School"
      variant="forwarded"
    />,
    '/free/admin/approve'
  );
  expect(html).toContain('This link was replaced');
  expect(html).toContain(
    linkReplacedBody('Jordan Rivera', 'Lincoln High School', 'forwarded', true)
  );
  expect(html).toContain('Terms');
  expect(html).toContain('Privacy');
});
