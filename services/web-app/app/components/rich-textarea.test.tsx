import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRichTextarea } from '~/hooks/useRichTextarea';

// Drives useRichTextarea against a real <textarea> and exposes the latest hook
// return value so the test can invoke handleKeyDown directly — this exercises
// the real Enter/Shift/modifier logic without depending on React's synthetic
// event system (which is unreliable under happy-dom for dispatched keydowns).
type HookApi = ReturnType<typeof useRichTextarea>;

function Harness({
  onCmdEnter,
  submitOnEnter,
  apiRef,
}: {
  onCmdEnter: (text: string) => void;
  submitOnEnter?: boolean;
  apiRef: { current: HookApi | null };
}) {
  const hook = useRichTextarea({ onCmdEnter, submitOnEnter });
  apiRef.current = hook;
  return (
    <textarea
      ref={hook.textareaRef}
      onChange={hook.handleTextareaChange}
      onKeyDown={hook.handleKeyDown}
      data-testid="t"
    />
  );
}

let container: HTMLDivElement;
let root: Root;
const apiRef: { current: HookApi | null } = { current: null };

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  apiRef.current = null;
});

function render(
  onCmdEnter: (text: string) => void,
  submitOnEnter?: boolean
) {
  act(() => {
    root.render(
      <Harness
        onCmdEnter={onCmdEnter}
        submitOnEnter={submitOnEnter}
        apiRef={apiRef}
      />
    );
  });
}

function typeText(value: string) {
  const el = container.querySelector('[data-testid="t"]') as HTMLTextAreaElement;
  el.value = value;
  // handleTextareaChange reads the textarea value and flips hasText.
  act(() => apiRef.current!.handleTextareaChange());
}

function pressEnter(init: Partial<ReactKeyboardEvent<HTMLTextAreaElement>> = {}) {
  let defaultPrevented = false;
  const event = {
    key: 'Enter',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    nativeEvent: { isComposing: false },
    preventDefault: () => {
      defaultPrevented = true;
    },
    ...init,
  } as unknown as ReactKeyboardEvent<HTMLTextAreaElement>;
  act(() => apiRef.current!.handleKeyDown(event));
  return { defaultPrevented };
}

describe('useRichTextarea Enter behavior', () => {
  it('submits on plain Enter when submitOnEnter is set', () => {
    const onCmdEnter = mock();
    render(onCmdEnter, true);

    typeText('hello tutor');
    const { defaultPrevented } = pressEnter();

    expect(onCmdEnter).toHaveBeenCalledTimes(1);
    expect(onCmdEnter).toHaveBeenCalledWith('hello tutor');
    expect(defaultPrevented).toBe(true);
    // The box is cleared after sending.
    const el = container.querySelector(
      '[data-testid="t"]'
    ) as HTMLTextAreaElement;
    expect(el.value).toBe('');
  });

  it('inserts a newline on Shift+Enter instead of submitting', () => {
    const onCmdEnter = mock();
    render(onCmdEnter, true);

    typeText('line one');
    const { defaultPrevented } = pressEnter({ shiftKey: true });

    expect(onCmdEnter).not.toHaveBeenCalled();
    // Not swallowed, so the textarea inserts the newline itself.
    expect(defaultPrevented).toBe(false);
  });

  it('does not submit on an empty plain Enter', () => {
    const onCmdEnter = mock();
    render(onCmdEnter, true);

    pressEnter();

    expect(onCmdEnter).not.toHaveBeenCalled();
  });

  it('ignores Enter fired mid-IME-composition', () => {
    const onCmdEnter = mock();
    render(onCmdEnter, true);

    typeText('こんにちは');
    pressEnter({ nativeEvent: { isComposing: true } as any });

    expect(onCmdEnter).not.toHaveBeenCalled();
  });

  it('without submitOnEnter, plain Enter does nothing but Cmd/Ctrl+Enter still submits', () => {
    const onCmdEnter = mock();
    render(onCmdEnter, false);

    typeText('a reply');
    pressEnter();
    expect(onCmdEnter).not.toHaveBeenCalled();

    pressEnter({ metaKey: true });
    expect(onCmdEnter).toHaveBeenCalledWith('a reply');
  });
});
