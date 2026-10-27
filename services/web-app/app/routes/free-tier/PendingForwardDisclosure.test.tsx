import { renderToStaticMarkup } from 'react-dom/server';
import { expect, mock, test } from 'bun:test';
import { PendingForwardDisclosure } from './PendingForwardDisclosure';

mock.module('react-router', () => ({
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  useNavigation: () => ({ state: 'idle' }),
}));

test('collapsed pending forward shows disclosure under recipient flow', () => {
  const html = renderToStaticMarkup(
    <PendingForwardDisclosure
      currentAdminName="Dr. Alan Brooks"
      currentAdminEmail="admin@example.test"
      approvalId="ap1"
      open={false}
      onOpenChange={() => {}}
      forwarding={false}
      schoolName="Lincoln High School"
    />
  );
  expect(html).toContain('Not the right person?');
  expect(html).toContain('data-testid="pending-forward-disclosure"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('free-tier-pending-forward-panel-open');
});

test('dashboard rail trigger uses inline send link copy', () => {
  const html = renderToStaticMarkup(
    <PendingForwardDisclosure
      triggerVariant="dashboard-rail"
      currentAdminName="Dr. Alan Brooks"
      currentAdminEmail="admin@example.test"
      approvalId="ap1"
      open={false}
      onOpenChange={() => {}}
      forwarding={false}
      schoolName="Lincoln High School"
    />
  );
  expect(html).toContain('Not the right person?');
  expect(html).toContain('Send to an additional administrator');
  expect(html).not.toContain('free-tier-pending-forward-chevron');
});

test('expanded pending forward shows tinted panel and helper copy', () => {
  const html = renderToStaticMarkup(
    <PendingForwardDisclosure
      currentAdminName="Dr. Alan Brooks"
      currentAdminEmail="admin@example.test"
      approvalId="ap1"
      open
      onOpenChange={() => {}}
      forwarding={false}
      schoolName="Lincoln High School"
    />
  );
  expect(html).toContain('Send to a different administrator');
  expect(html).toContain('stop reminders to Dr. Alan Brooks');
  expect(html).toContain('Administrator name');
  expect(html).toContain('Administrator email');
  expect(html).toContain('name@school.org');
  expect(html).toContain('Forward request');
  expect(html).toContain('Cancel');
  expect(html).toContain('free-tier-pending-forward-panel');
});
