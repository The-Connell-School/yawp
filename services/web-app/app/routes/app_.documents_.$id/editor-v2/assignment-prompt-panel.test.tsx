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

const { AssignmentPromptPanel } = await import('./assignment-prompt-panel');

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

function render(prompt: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AssignmentPromptPanel
        assignment={
          {
            id: 'assignment-1',
            title: 'Juliet argues with a name',
            prompt,
          } as never
        }
      />
    );
  });
  return container;
}

/**
 * The panel only takes the tutor's column when the tutor is off, which is
 * what a teacher calls a cold write. The student should be told that is what
 * this is, rather than wondering where the tutor went.
 */
describe('AssignmentPromptPanel', () => {
  it('tells the student this is a cold write', () => {
    const container = render('Quote the line where her argument turns.');

    expect(container.textContent).toContain('Cold write');
    expect(container.textContent).toContain('on your own');
    expect(container.textContent).toContain(
      'Quote the line where her argument turns.'
    );
  });

  it('renders nothing without a prompt', () => {
    const container = render('   ');
    expect(container.textContent).toBe('');
  });
});
