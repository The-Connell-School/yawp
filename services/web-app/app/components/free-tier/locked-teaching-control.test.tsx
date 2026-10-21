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

mock.module('~/hooks/useBreakpoint', () => ({
  default: () => 'md',
}));

const { LockedTeachingControl } = await import('./locked-teaching-control');

describe('LockedTeachingControl desktop tooltip', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('dismisses the tooltip when the user presses Escape', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(LockedTeachingControl, {
          locked: true,
          adminName: 'Dr. Patel',
          tooltip: 'Unlocks once your administrator approves.',
          children: createElement(
            Button,
            { type: 'button' },
            'Locked action'
          ) as ReactElement,
        })
      );
    });

    const trigger = container.querySelector('button')!;
    await act(async () => {
      trigger.dispatchEvent(
        new PointerEvent('pointerenter', { bubbles: true, cancelable: true })
      );
      trigger.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true, cancelable: true })
      );
    });
    await act(async () => {
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
