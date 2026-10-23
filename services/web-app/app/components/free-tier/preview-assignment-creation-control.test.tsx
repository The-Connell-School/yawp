import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '~/components/ui/button';
import { PREVIEW_ASSIGNMENT_CREATION_DISABLED_TOOLTIP } from '~/domain/free-tier/teaching-access-copy';

const { PreviewAssignmentCreationControl } = await import(
  './preview-assignment-creation-control'
);

function renderControl() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        PreviewAssignmentCreationControl,
        {
          children: createElement(
            Button,
            { type: 'button' },
            'Create assignment'
          ) as ReactElement,
        }
      )
    );
  });
  return { container, root };
}

describe('PreviewAssignmentCreationControl', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    if (container) {
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  it('marks the trigger aria-disabled and exposes the preview tooltip on focus', async () => {
    ({ container, root } = renderControl());
    const trigger = container!.querySelector('button')!;
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      trigger.focus();
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(
      Array.from(document.querySelectorAll('[role="tooltip"]')).some((node) =>
        node.textContent?.includes(PREVIEW_ASSIGNMENT_CREATION_DISABLED_TOOLTIP)
      )
    ).toBe(true);
  });
});
