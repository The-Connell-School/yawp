import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { UnsavedChangesDialog } = await import('./unsaved-changes-dialog');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root };
}

describe('UnsavedChangesDialog', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    document.body.innerHTML = '';
  });

  it('renders nothing to the DOM when closed', () => {
    ({ root } = render(
      <UnsavedChangesDialog
        open={false}
        onContinueEditing={() => {}}
        onDiscard={() => {}}
      />
    ));

    expect(document.body.textContent).not.toContain('Unsaved changes');
  });

  it('shows the warning copy and both actions when open', () => {
    ({ root } = render(
      <UnsavedChangesDialog
        open
        onContinueEditing={() => {}}
        onDiscard={() => {}}
      />
    ));

    expect(document.body.textContent).toContain(
      "You're about to exit with unsaved changes"
    );
    expect(
      Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent === 'Go back'
      )
    ).toBe(true);
    expect(
      Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent === 'Discard changes'
      )
    ).toBe(true);
  });

  it('calls onContinueEditing when "Go back" is clicked', () => {
    const onContinueEditing = mock();
    ({ root } = render(
      <UnsavedChangesDialog
        open
        onContinueEditing={onContinueEditing}
        onDiscard={() => {}}
      />
    ));

    const goBack = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Go back'
    );
    act(() => {
      goBack?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });

    // AlertDialogCancel both fires this click handler and closes the
    // primitive (which fires onOpenChange(false) too) — either path lands on
    // "go back", so at least once is the contract, not an exact count.
    expect(onContinueEditing).toHaveBeenCalled();
  });

  it('calls onDiscard when "Discard changes" is clicked', () => {
    const onDiscard = mock();
    ({ root } = render(
      <UnsavedChangesDialog
        open
        onContinueEditing={() => {}}
        onDiscard={onDiscard}
      />
    ));

    const discard = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Discard changes'
    );
    act(() => {
      discard?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
    });

    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
