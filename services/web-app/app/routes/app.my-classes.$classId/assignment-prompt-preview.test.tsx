import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AssignmentPromptPreview,
  isAssignmentPromptTruncatable,
} from './assignment-prompt-preview';

let root: Root | null = null;

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = '';
  root = null;
});

describe('AssignmentPromptPreview', () => {
  it('does not show a toggle for short prompts', () => {
    const el = render(
      <AssignmentPromptPreview prompt="Write a short paragraph about trade." />
    );
    expect(el.querySelector('[data-testid="assignment-prompt-toggle"]')).toBeFalsy();
    expect(el.textContent).toContain('Write a short paragraph about trade.');
  });

  it('truncates long prompts behind a show-full toggle', () => {
    const prompt = `${'Analyze '.repeat(40)}industrialization.`;
    expect(isAssignmentPromptTruncatable(prompt)).toBe(true);

    const el = render(<AssignmentPromptPreview prompt={prompt} />);
    const toggle = el.querySelector(
      '[data-testid="assignment-prompt-toggle"]'
    ) as HTMLButtonElement;
    expect(toggle.textContent).toContain('Show full prompt');
    act(() => toggle.click());
    expect(toggle.textContent).toContain('Show less');
  });
});
