import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// react-router's useNavigation needs a router context; stub it as idle.
mock.module('react-router', () => ({
  useNavigation: () => ({ state: 'idle' }),
}));

import { ResponseBar } from './response-bar';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const has = (testId: string) =>
  !!container.querySelector(`[data-testid="${testId}"]`);

function renderBar(props: Partial<Parameters<typeof ResponseBar>[0]> = {}) {
  act(() => {
    root.render(
      <ResponseBar
        buttons={[]}
        respond={mock()}
        showChatButton
        {...props}
      />
    );
  });
}

describe('ResponseBar chat persistence', () => {
  it('shows the choices row (Chat button) when the conversation has not started', () => {
    renderBar({ defaultOpen: false });
    expect(has('tutor-chat-open')).toBe(true);
    expect(has('tutor-chat-input')).toBe(false);
  });

  it('opens straight into the chat input once a conversation is underway', () => {
    renderBar({ defaultOpen: true });
    expect(has('tutor-chat-input')).toBe(true);
    expect(has('tutor-chat-open')).toBe(false);
  });

  it('keeps the chat input open across a tutor response (transient disabled)', () => {
    renderBar({ defaultOpen: true, disabled: false });
    expect(has('tutor-chat-input')).toBe(true);

    // Tutor is responding: disabled flips true then back to false.
    renderBar({ defaultOpen: true, disabled: true });
    expect(has('tutor-chat-input')).toBe(true);

    renderBar({ defaultOpen: true, disabled: false });
    expect(has('tutor-chat-input')).toBe(true);
  });

  it('collapses the chat input when the session becomes locked', () => {
    renderBar({ defaultOpen: true, locked: false });
    expect(has('tutor-chat-input')).toBe(true);

    renderBar({ defaultOpen: true, locked: true });
    expect(has('tutor-chat-input')).toBe(false);
    expect(has('tutor-chat-open')).toBe(true);
  });

  it('does not auto-open over quick-reply buttons', () => {
    renderBar({
      defaultOpen: true,
      buttons: [{ label: 'Ready', action: 'advance' }],
    });
    // Buttons still take precedence; the student can open chat manually.
    expect(has('tutor-chat-input')).toBe(false);
    expect(has('tutor-chat-open')).toBe(true);
  });
});
