import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  act,
  forwardRef,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

mock.module('react-router', () => ({
  Link: forwardRef(function Link(
    {
      children,
      to,
      ...props
    }: {
      children?: ReactNode;
      to: string;
    },
    ref: ForwardedRef<HTMLAnchorElement>
  ) {
    return (
      <a ref={ref} href={to} {...props}>
        {children}
      </a>
    );
  }),
}));

const { ScrollTabBar } = await import('./scroll-tab-bar');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
});

const tabs = [
  {
    to: '/app/admin/general',
    label: 'General',
    icon: <svg data-icon="general" />,
  },
  {
    to: '/app/admin/organizations',
    label: 'Organizations',
    icon: <svg data-icon="organizations" />,
  },
  {
    to: '/app/admin/free-tier',
    label: 'Free tier',
    icon: <svg data-icon="free-tier" />,
  },
];

describe('ScrollTabBar', () => {
  it('keeps each icon in its own slot before a full label and does not shrink the tab', () => {
    const { container, root } = render(
      <ScrollTabBar
        tabs={tabs}
        activeTo="/app/admin/organizations"
        ariaLabel="Admin sections"
        testId="admin-section-tabs"
        labelFor={(tab) => tab.label}
      />
    );

    const organizations = container.querySelector(
      'a[href="/app/admin/organizations"]'
    );
    expect(organizations?.getAttribute('aria-current')).toBe('page');
    expect(organizations?.classList.contains('shrink-0')).toBe(true);
    expect(organizations?.classList.contains('btn')).toBe(true);
    expect(organizations?.classList.contains('btn--secondary')).toBe(true);
    expect(organizations?.className.includes('truncate')).toBe(false);
    expect(organizations?.firstElementChild?.getAttribute('data-icon')).toBe(
      'organizations'
    );
    expect(organizations?.querySelector('span')?.textContent).toBe(
      'Organizations'
    );

    const general = container.querySelector('a[href="/app/admin/general"]');
    expect(general?.classList.contains('btn--ghost')).toBe(true);
    expect(general?.classList.contains('shrink-0')).toBe(true);
    expect(general?.textContent).toContain('General');

    const bar = container.querySelector('[data-testid="admin-section-tabs"]');
    const track = bar?.querySelector<HTMLElement>('.overflow-x-auto');
    expect(track).toBeTruthy();
    Object.defineProperty(track!, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(track!, 'scrollWidth', { configurable: true, value: 480 });
    track!.scrollLeft = 0;

    return act(async () => {
      track?.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }).then(() => {
      expect(bar?.getAttribute('data-can-scroll-left')).toBe('false');
      expect(bar?.getAttribute('data-can-scroll-right')).toBe('true');
      const right = container.querySelector(
        '[data-testid="admin-section-tabs-scroll-right"]'
      );
      expect(right).toBeTruthy();
      expect(right?.className.includes('absolute')).toBe(false);
      expect(track?.contains(right!)).toBe(false);
      expect(
        container.querySelector('[data-testid="admin-section-tabs-scroll-left"]')
      ).toBeNull();
      act(() => {
        root.unmount();
      });
    });
  });
});
