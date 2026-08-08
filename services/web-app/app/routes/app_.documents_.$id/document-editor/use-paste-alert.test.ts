import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { usePasteAlert } from './use-paste-alert';

const DOC_ID = 'doc-1';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let editor: Editor | null = null;

function mountPasteAlert(docId: string, targetEditor: Editor) {
  function Harness() {
    usePasteAlert(targetEditor, docId);
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

function editorDom() {
  return editor!.view.dom as HTMLElement;
}

function firePaste(text: string, target: HTMLElement = editorDom()) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

function fireCopyOrCut(type: 'copy' | 'cut', target: EventTarget = document) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('usePasteAlert', () => {
  let fetchMock: ReturnType<typeof mock>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit],
      content: '<p>hello world, this is the editor content</p>',
    });
    localStorage.clear();
    originalFetch = globalThis.fetch;
    fetchMock = mock(() => Promise.resolve(new Response('{}')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const mounted = mountPasteAlert(DOC_ID, editor);
    root = mounted.root;
    container = mounted.container;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    if (container) container.remove();
    editor?.destroy();
    globalThis.fetch = originalFetch;
    localStorage.clear();
    document.body.innerHTML = '';
    root = null;
    container = null;
    editor = null;
  });

  it('posts a paste alert for a large paste with no prior copy anywhere in the app', () => {
    firePaste('x'.repeat(200));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/paste-alert');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      documentId: DOC_ID,
      textLength: 200,
      content: 'x'.repeat(200),
    });
  });

  it('does not post for pastes under the 200-char threshold', () => {
    firePaste('x'.repeat(199));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not post when a copy happened anywhere in the app first', () => {
    fireCopyOrCut('copy');
    firePaste('x'.repeat(200));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not post when a cut happened anywhere in the app first (reorder a paragraph)', () => {
    fireCopyOrCut('cut');
    firePaste('x'.repeat(200));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not require the copy/cut selection to be inside this editor — any app surface counts', () => {
    const outside = document.createElement('div');
    outside.textContent = 'a prompt panel elsewhere in the app';
    document.body.appendChild(outside);

    fireCopyOrCut('copy', outside);
    firePaste('x'.repeat(200));

    expect(fetchMock).not.toHaveBeenCalled();
    outside.remove();
  });

  it('consumes the internal-copy flag after one paste — a second unrelated paste posts an alert', () => {
    fireCopyOrCut('copy');
    firePaste('x'.repeat(200));
    expect(fetchMock).not.toHaveBeenCalled();

    firePaste('y'.repeat(200));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recognizes an in-app copy across two editor instances sharing the browser (cross-tab, no time limit)', async () => {
    fireCopyOrCut('copy');

    // Simulate a large delay before the paste — the old 5s window would
    // have expired this; the new rule has no expiry.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Simulate tab B for a *different* document: a fresh hook instance
    // backed by a fresh editor, sharing localStorage (as two real tabs
    // would).
    const editorB = new Editor({
      extensions: [StarterKit],
      content: '<p>tab b content</p>',
    });
    const mountedB = mountPasteAlert('doc-2', editorB);

    firePaste('x'.repeat(200), editorB.view.dom as HTMLElement);

    expect(fetchMock).not.toHaveBeenCalled();

    act(() => mountedB.root.unmount());
    mountedB.container.remove();
    editorB.destroy();
  });

  it('still posts an alert when nothing was ever copied in the app (genuinely external paste)', () => {
    firePaste('x'.repeat(500));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
