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

function mountPasteAlert(docId: string) {
  function Harness() {
    usePasteAlert(editor, docId);
    return null;
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(Harness));
  });
}

function editorDom() {
  return editor!.view.dom as HTMLElement;
}

/** Selects all text inside the editor's DOM so getSelection() resolves inside it. */
function selectInsideEditor() {
  const dom = editorDom();
  const range = document.createRange();
  range.selectNodeContents(dom);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Selects text inside an element outside the editor. */
function selectOutsideEditor(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function firePaste(text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  });
  act(() => {
    editorDom().dispatchEvent(event);
  });
}

function fireCopyOrCut(type: 'copy' | 'cut') {
  const event = new Event(type, { bubbles: true, cancelable: true });
  act(() => {
    document.dispatchEvent(event);
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
    mountPasteAlert(DOC_ID);
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

  it('posts a paste alert for a large paste with no prior in-editor copy', () => {
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

  it('does not post when the same text was just copied from inside the editor', () => {
    selectInsideEditor();
    fireCopyOrCut('copy');
    firePaste('x'.repeat(200));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not post when the same text was just cut from inside the editor (reorder paragraph)', () => {
    selectInsideEditor();
    fireCopyOrCut('cut');
    firePaste('x'.repeat(200));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still posts when the copy originated outside the editor', () => {
    const outside = document.createElement('div');
    outside.textContent = 'some other page text';
    document.body.appendChild(outside);

    selectOutsideEditor(outside);
    fireCopyOrCut('copy');
    firePaste('x'.repeat(200));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it('still posts when the cut originated outside the editor', () => {
    const outside = document.createElement('div');
    outside.textContent = 'some other page text';
    document.body.appendChild(outside);

    selectOutsideEditor(outside);
    fireCopyOrCut('cut');
    firePaste('x'.repeat(200));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it('consumes the same-doc flag after one paste — a second paste posts an alert', () => {
    selectInsideEditor();
    fireCopyOrCut('copy');
    firePaste('x'.repeat(200));
    expect(fetchMock).not.toHaveBeenCalled();

    firePaste('y'.repeat(200));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recognizes a same-document copy/paste across two editor instances sharing the browser (cross-tab)', () => {
    // Simulate tab A: copy inside the editor.
    selectInsideEditor();
    fireCopyOrCut('copy');

    // Simulate tab B for the *same* document: a fresh hook instance backed
    // by a fresh editor, sharing localStorage (as two real tabs would).
    const editorB = new Editor({
      extensions: [StarterKit],
      content: '<p>tab b content</p>',
    });
    function HarnessB() {
      usePasteAlert(editorB, DOC_ID);
      return null;
    }
    const containerB = document.createElement('div');
    document.body.appendChild(containerB);
    const rootB = createRoot(containerB);
    act(() => {
      rootB.render(createElement(HarnessB));
    });

    const pasteEvent = new Event('paste', {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => 'x'.repeat(200) },
    });
    act(() => {
      (editorB.view.dom as HTMLElement).dispatchEvent(pasteEvent);
    });

    expect(fetchMock).not.toHaveBeenCalled();

    act(() => rootB.unmount());
    containerB.remove();
    editorB.destroy();
  });

  it('posts again once the same-doc window has elapsed', async () => {
    selectInsideEditor();
    fireCopyOrCut('copy');

    await new Promise((resolve) => setTimeout(resolve, 5100));

    firePaste('x'.repeat(200));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 6000);
});
