import { renderToStaticMarkup } from 'react-dom/server';
import { expect, mock, test } from 'bun:test';

mock.module('./useAdminCopyPass1', () => ({
  useAdminCopyPass1: () => true,
}));

const { AdminLinkReplacedCard } = await import('./AdminApprovalStates');
const { linkReplacedBody } = await import('~/domain/free-tier/admin-approval-copy');

test('link replaced card uses designed title and body copy', () => {
  const html = renderToStaticMarkup(
    <AdminLinkReplacedCard
      teacherName="Jordan Rivera"
      schoolName="Lincoln High School"
      variant="forwarded"
    />
  );
  expect(html).toContain('This link was replaced');
  expect(html).toContain(
    linkReplacedBody('Jordan Rivera', 'Lincoln High School')
  );
  expect(html).toContain('Terms');
  expect(html).toContain('Privacy');
});
