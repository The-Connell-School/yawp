import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import { AdminLinkReplacedCard } from './AdminApprovalStates';
import { linkReplacedBody } from '~/domain/free-tier/admin-approval-copy';

test('link replaced card uses designed title and body copy', () => {
  const html = renderToStaticMarkup(
    <AdminLinkReplacedCard
      teacherName="Jordan Rivera"
      schoolName="Lincoln High School"
    />
  );
  expect(html).toContain('This link was replaced');
  expect(html).toContain(
    linkReplacedBody('Jordan Rivera', 'Lincoln High School')
  );
  expect(html).toContain('Terms');
  expect(html).toContain('Privacy');
});
