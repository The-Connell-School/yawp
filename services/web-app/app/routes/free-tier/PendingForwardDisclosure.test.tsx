import { renderToStaticMarkup } from 'react-dom/server';
import { expect, mock, test } from 'bun:test';
import { PendingForwardDisclosure } from './PendingForwardDisclosure';

mock.module('react-router', () => ({
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
  useNavigation: () => ({ state: 'idle' }),
}));

mock.module('~/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="pending-forward-dialog-open">{children}</div> : null,
  DialogContent: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    'data-testid'?: string;
  }) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

test('pending forward trigger opens modal flow', () => {
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
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).not.toContain('pending-forward-dialog-open');
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
  expect(html).toContain('Send to an additional administrator');
  expect(html).not.toContain('Not the right person?');
});

test('timeline trigger uses pending forward link under current step', () => {
  const html = renderToStaticMarkup(
    <PendingForwardDisclosure
      triggerVariant="timeline"
      currentAdminName="Dr. Alan Brooks"
      currentAdminEmail="admin@example.test"
      approvalId="ap1"
      open={false}
      onOpenChange={() => {}}
      forwarding={false}
      schoolName="Lincoln High School"
    />
  );
  expect(html).toContain('Send to another administrator');
  expect(html).not.toContain('Not the right person?');
});

test('open pending forward modal shows form copy', () => {
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
  expect(html).toContain('Title');
  expect(html).toContain('Administrator name');
  expect(html).toContain('Administrator email');
  expect(html).toContain('name@school.org');
  expect(html).toContain('Forward request');
  expect(html).toContain('Cancel');
  expect(html).toContain('data-testid="pending-forward-modal"');
});
