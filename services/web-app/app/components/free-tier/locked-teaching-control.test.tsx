import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TEACHING_ACCESS_LOCKED_TOOLTIP } from '~/domain/free-tier/teaching-access-copy';

mock.module('~/hooks/useBreakpoint', () => ({
  default: () => 'lg',
}));

const { LockedTeachingControl } = await import('./locked-teaching-control');

function renderLockedControl() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <LockedTeachingControl locked adminName="Dr. Patel">
        <button type="button">Create assignment</button>
      </LockedTeachingControl>
    );
  });
  return { container, root };
}

describe('LockedTeachingControl desktop tooltip', () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  it('shows the locked tooltip on keyboard focus', async () => {
    ({ root } = renderLockedControl());
    const trigger = document.querySelector(
      'button[aria-disabled="true"]'
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    act(() => {
      trigger.focus();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(
      Array.from(document.querySelectorAll('[role="tooltip"]')).some((node) =>
        node.textContent?.includes(TEACHING_ACCESS_LOCKED_TOOLTIP)
      )
    ).toBe(true);
  });

  it('hides the tooltip on blur', async () => {
    ({ root } = renderLockedControl());
    const trigger = document.querySelector(
      'button[aria-disabled="true"]'
    ) as HTMLButtonElement;
    act(() => {
      trigger.focus();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    act(() => {
      trigger.blur();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
