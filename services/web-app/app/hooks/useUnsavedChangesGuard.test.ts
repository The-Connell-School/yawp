import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(isDirty: boolean, onClose: () => void) {
  let api: ReturnType<typeof useUnsavedChangesGuard> | null = null;

  function Harness() {
    // Read isDirty via a ref-like closure so tests can flip it between acts.
    const [dirty] = useState(isDirty);
    api = useUnsavedChangesGuard({ isDirty: dirty, onClose });
    return null;
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(Harness));
  });

  return () => api!;
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  if (container) {
    container.remove();
    container = null;
  }
});

describe('useUnsavedChangesGuard', () => {
  it('closes immediately when nothing is dirty', () => {
    const onClose = mock();
    const getApi = mount(false, onClose);

    act(() => {
      getApi().requestClose();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getApi().guardOpen).toBe(false);
  });

  it('opens the guard instead of closing when dirty', () => {
    const onClose = mock();
    const getApi = mount(true, onClose);

    act(() => {
      getApi().requestClose();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(getApi().guardOpen).toBe(true);
  });

  it('confirmDiscard closes and dismisses the guard', () => {
    const onClose = mock();
    const getApi = mount(true, onClose);

    act(() => {
      getApi().requestClose();
    });
    act(() => {
      getApi().confirmDiscard();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getApi().guardOpen).toBe(false);
  });

  it('cancelDiscard dismisses the guard without closing', () => {
    const onClose = mock();
    const getApi = mount(true, onClose);

    act(() => {
      getApi().requestClose();
    });
    act(() => {
      getApi().cancelDiscard();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(getApi().guardOpen).toBe(false);
  });
});
