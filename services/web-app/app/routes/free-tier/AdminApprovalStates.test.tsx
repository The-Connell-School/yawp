import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, mock, test } from 'bun:test';

mock.module('./useFreeTierLayoutContext', () => ({
  useFreeTierEnabled: () => true,
}));

mock.module('~/hooks/useUser', () => ({
  useOptionalUser: () => null,
}));

mock.module('~/hooks/useRequestInfo', () => ({
  useRequestInfo: () => ({ origin: 'https://yawp.school' }),
}));

mock.module('react-router', () => ({
  useLocation: () => ({ pathname: '/free/admin/approve', search: '' }),
  useSearchParams: () => [new URLSearchParams()],
  Link: ({ children }: { children: ReactNode }) => children,
  Form: ({ children }: { children: ReactNode }) => children,
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
    linkReplacedBody('Jordan Rivera', 'Lincoln High School', 'forwarded', true)
  );
  expect(html).toContain('Terms');
  expect(html).toContain('Privacy');
});
