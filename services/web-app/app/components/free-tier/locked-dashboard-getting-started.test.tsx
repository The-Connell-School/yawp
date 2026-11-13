import { expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('react-router', () => ({
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  useFetcher: () => ({ state: 'idle', data: undefined, submit: () => {} }),
  useRevalidator: () => ({ revalidate: () => {} }),
  useNavigation: () => ({ state: 'idle' }),
}));

test('locked getting started shows forward under awaiting approval step', async () => {
  mock.module('~/components/free-tier/teaching-access-context', () => ({
    useTeachingAccess: () => ({
      locked: true,
      loading: false,
      state: {
        variant: 'locked',
        adminName: 'Dr. Alan Brooks',
        adminEmail: 'admin@school.test',
        schoolName: 'North High',
        pendingApprovalId: 'ap-1',
        forwardDisclosureAvailable: true,
        approvalFirstSentAt: null,
      },
    }),
  }));

  const { LockedDashboardGettingStarted } = await import(
    './locked-dashboard-getting-started'
  );
  const html = renderToStaticMarkup(<LockedDashboardGettingStarted />);
  expect(html).toContain('locked-dashboard-getting-started');
  expect(html).toContain('Awaiting administrative approval');
  expect(html).toContain('Send to another administrator');
  expect(html).toContain('data-testid="pending-forward-disclosure"');

  mock.restore();
});
