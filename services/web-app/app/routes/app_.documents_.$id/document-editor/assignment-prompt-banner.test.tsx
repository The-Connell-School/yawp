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

const { AssignmentPromptBanner } = await import('./document-editor');

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

function render(paragraphMode: string | null) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AssignmentPromptBanner
        docId="doc-1"
        assignment={{
          id: 'assignment-1',
          title: 'Phones',
          prompt: 'Should phones be banned?',
          paragraphMode,
        }}
      />
    );
  });
  return container;
}

/** With the tutor on, the prompt is a banner over the editor; the guide sits in it. */
describe('AssignmentPromptBanner paragraph-type guide', () => {
  it('offers the guide for an Argue assignment', () => {
    const container = render('argue');

    const button = container.querySelector(
      '[data-testid="paragraph-guide-open"]'
    ) as HTMLButtonElement | null;
    expect(button?.textContent).toContain('What you’re aiming for');
  });

  it('offers nothing without a paragraph type', () => {
    const container = render(null);

    expect(
      container.querySelector('[data-testid="paragraph-guide-open"]')
    ).toBeNull();
  });
});
