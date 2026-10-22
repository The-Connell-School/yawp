import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '~/components/ui/button';
import { TEACHING_ACCESS_LOCKED_TOOLTIP } from '~/domain/free-tier/teaching-access-copy';

mock.module('~/hooks/useBreakpoint', () => ({
  default: () => 'md',
}));

const { LockedTeachingControl } = await import('./locked-teaching-control');

function renderDesktopLockedControl(tooltip?: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(LockedTeachingControl, {
        locked: true,
        adminName: 'Dr. Patel',
        tooltip: tooltip ?? TEACHING_ACCESS_LOCKED_TOOLTIP,
        children: createElement(
          Button,
          { type: 'button' },
          'Locked action'
        ) as ReactElement,
      })
    );
  });
  return { container, root };
}

describe('LockedTeachingControl desktop tooltip', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    if (container) {
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  it('shows the locked tooltip on keyboard focus', async () => {
    ({ container, root } = renderDesktopLockedControl());
    const trigger = container!.querySelector('button')!;
    await act(async () => {
      trigger.focus();
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(
      Array.from(document.querySelectorAll('[role="tooltip"]')).some((node) =>
        node.textContent?.includes(TEACHING_ACCESS_LOCKED_TOOLTIP)
      )
    ).toBe(true);
  });

  it('hides the tooltip on blur', async () => {
    ({ container, root } = renderDesktopLockedControl());
    const trigger = container!.querySelector('button')!;
    await act(async () => {
      trigger.focus();
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    await act(async () => {
      trigger.blur();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('dismisses the tooltip when the user presses Escape', async () => {
    ({ container, root } = renderDesktopLockedControl(
      'Unlocks once your administrator approves.'
    ));
    const trigger = container!.querySelector('button')!;
    await act(async () => {
      trigger.dispatchEvent(
        new PointerEvent('pointerenter', { bubbles: true, cancelable: true })
      );
      trigger.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true, cancelable: true })
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(
      document.body.textContent?.includes(
        'Unlocks once your administrator approves.'
      )
    ).toBe(true);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    });

    expect(
      document.body.querySelector('[data-radix-popper-content-wrapper]')
    ).toBeNull();
  });
});
