import { describe, expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteLicenseHowToTeachLockedSection } from './site-license-how-to-teach-lock';

mock.module('~/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children: ReactNode }) => (
    <div data-popover-anchor="">{children}</div>
  ),
  PopoverContent: (props: Record<string, unknown>) => (
    <div data-popover-content="" {...props} />
  ),
}));

describe('SiteLicenseHowToTeachLockedSection', () => {
  test('anchors the license popover with collision-aware placement', () => {
    const html = renderToStaticMarkup(
      <SiteLicenseHowToTeachLockedSection heading="How to Teach It">
        <p>Materials</p>
      </SiteLicenseHowToTeachLockedSection>
    );
    expect(html).toContain('data-popover-anchor');
    expect(html).toContain('collisionPadding="16"');
    expect(html).toContain('side="bottom"');
  });
});