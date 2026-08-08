import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useInternalCopyMarker } from './useInternalCopyMarker';
import {
  APP_INTERNAL_COPY_KEY,
  consumeInternalCopyFlag,
} from '~/utils/internal-copy';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mountMarker() {
  function Harness() {
    useInternalCopyMarker();
    return null;
  }

  const localContainer = document.createElement('div');
  document.body.appendChild(localContainer);
  const localRoot = createRoot(localContainer);
  act(() => {
    localRoot.render(createElement(Harness));
  });
  return { root: localRoot, container: localContainer };
}

function fireCopyOrCut(type: 'copy' | 'cut', target: EventTarget = document) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('useInternalCopyMarker', () => {
  beforeEach(() => {
    localStorage.clear();
    const mounted = mountMarker();
    root = mounted.root;
    container = mounted.container;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    if (container) container.remove();
    localStorage.clear();
    document.body.innerHTML = '';
    root = null;
    container = null;
  });

  it('marks a copy from any surface in the app, not just a document editor', () => {
    const classPageCell = document.createElement('td');
    classPageCell.textContent = 'an assignment prompt on the class page';
    document.body.appendChild(classPageCell);

    fireCopyOrCut('copy', classPageCell);

    expect(localStorage.getItem(APP_INTERNAL_COPY_KEY)).toBe('true');
    classPageCell.remove();
  });

  it('marks a cut from any surface in the app', () => {
    fireCopyOrCut('cut');
    expect(localStorage.getItem(APP_INTERNAL_COPY_KEY)).toBe('true');
  });

  it('does not set the flag when nothing was copied', () => {
    expect(localStorage.getItem(APP_INTERNAL_COPY_KEY)).toBeNull();
  });

  it('keeps the flag set across a route change (the hook stays mounted in the layout)', () => {
    fireCopyOrCut('copy');
    // No unmount here — the /app layout does not remount between routes, which
    // is the whole point of hoisting the listeners out of the editor.
    expect(consumeInternalCopyFlag()).toBe(true);
  });

  it('survives an editor mounting and unmounting underneath it', () => {
    fireCopyOrCut('copy');

    // A second marker mounting and unmounting (as a nested surface might)
    // must not tear down the layout-level listeners.
    const nested = mountMarker();
    act(() => nested.root.unmount());
    nested.container.remove();

    fireCopyOrCut('copy');
    expect(localStorage.getItem(APP_INTERNAL_COPY_KEY)).toBe('true');
  });

  it('stops marking once the layout itself unmounts', () => {
    act(() => root!.unmount());
    container!.remove();
    root = null;
    container = null;

    fireCopyOrCut('copy');
    expect(localStorage.getItem(APP_INTERNAL_COPY_KEY)).toBeNull();
  });
});
