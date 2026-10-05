import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { ParagraphTypeGuideButton } = await import('./paragraph-type-guide');

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

/**
 * Clicking the button opens the guide. The dialog itself is Radix's, whose
 * portal only renders when Radix was first imported with a DOM present —
 * which, in one shared Bun process, depends on which test file ran first. So
 * this asserts the open state the button controls; the dialog's contents are
 * covered by the guide's own render tests and the e2e spec.
 */
describe('ParagraphTypeGuideButton', () => {
  it('opens when clicked', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root!.render(<ParagraphTypeGuideButton paragraphModes={['analyze']} />)
    );

    const button = container.querySelector(
      '[data-testid="paragraph-guide-open"]'
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');

    act(() => button.click());

    expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});
