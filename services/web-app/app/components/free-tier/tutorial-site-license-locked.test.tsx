import { describe, expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TutorialSiteLicenseLockedView } from './tutorial-site-license-locked';

mock.module('react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

mock.module('~/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children: ReactNode }) => (
    <div data-popover-anchor="">{children}</div>
  ),
  PopoverContent: (props: Record<string, unknown>) => (
    <div data-popover-content="" {...props} />
  ),
}));

describe('TutorialSiteLicenseLockedView', () => {
  test('matches How to Teach It lock styling and copy', () => {
    const html = renderToStaticMarkup(
      <TutorialSiteLicenseLockedView assignmentTypePagePath="/app/assignment-types/x" />
    );
    expect(html).toContain('Comes with a school site license.');
    expect(html).toContain('how-to-teach-site-license-locked');
    expect(html).toContain('href="/app/assignment-types/x"');
  });
});