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
import { PastedSource } from './extensions/pasted-source';
import { useInternalCopyMarker } from '~/hooks/useInternalCopyMarker';
import { markInternalCopy } from '~/utils/internal-copy';

const DOC_ID = 'doc-1';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let editor: Editor | null = null;
let layoutRoot: Root | null = null;
let layoutContainer: HTMLDivElement | null = null;

/**
 * Stands in for the root layout, which owns the copy/cut listeners. It is
 * mounted before — and unmounted after — any editor, exactly as the real
 * layout outlives the editor route beneath it.
 */
function mountAppLayout() {
  function Layout() {
    useInternalCopyMarker();
    return null;
  }

  const localContainer = document.createElement('div');
  document.body.appendChild(localContainer);
  const localRoot = createRoot(localContainer);
  act(() => {
    localRoot.render(createElement(Layout));
  });
  return { root: localRoot, container: localContainer };
}

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
    // Only text/plain carries the payload; tiptap also probes for
    // 'vscode-editor-data' and expects JSON or nothing.
    value: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
      types: ['text/plain'],
    },
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
      extensions: [StarterKit, PastedSource],
      content: '<p>hello world, this is the editor content</p>',
    });
    localStorage.clear();
    originalFetch = globalThis.fetch;
    fetchMock = mock(() => Promise.resolve(new Response('{}')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const layout = mountAppLayout();
    layoutRoot = layout.root;
    layoutContainer = layout.container;
    const mounted = mountPasteAlert(DOC_ID, editor);
    root = mounted.root;
    container = mounted.container;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    if (container) container.remove();
    if (layoutRoot) act(() => layoutRoot!.unmount());
    if (layoutContainer) layoutContainer.remove();
    layoutRoot = null;
    layoutContainer = null;
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
      extensions: [StarterKit, PastedSource],
      content: '<p>tab b content</p>',
    });
    const mountedB = mountPasteAlert('doc-2', editorB);

    firePaste('x'.repeat(200), editorB.view.dom as HTMLElement);

    expect(fetchMock).not.toHaveBeenCalled();

    act(() => mountedB.root.unmount());
    mountedB.container.remove();
    editorB.destroy();
  });

  it('does not alarm on copy from a non-editor page, then navigate to the editor and paste', () => {
    // Start from a state where no editor is mounted at all — the student is
    // on the class page / an assignment prompt / writing lessons.
    act(() => root!.unmount());
    container!.remove();
    root = null;
    container = null;

    const classPageText = document.createElement('div');
    classPageText.textContent = 'assignment prompt text on a non-editor page';
    document.body.appendChild(classPageText);
    fireCopyOrCut('copy', classPageText);
    classPageText.remove();

    // Now navigate to a document and paste what was copied.
    const editorAfterNavigation = new Editor({
      extensions: [StarterKit, PastedSource],
      content: '<p>the document they navigated to</p>',
    });
    const mounted = mountPasteAlert('doc-after-navigation', editorAfterNavigation);
    root = mounted.root;
    container = mounted.container;

    firePaste(
      'x'.repeat(200),
      editorAfterNavigation.view.dom as HTMLElement
    );

    expect(fetchMock).not.toHaveBeenCalled();
    editorAfterNavigation.destroy();
  });

  it('does not alarm when the same in-app passage is pasted more than once', () => {
    const passage = 'a passage the student copied from their outline '.repeat(6);
    markInternalCopy(passage);

    firePaste(passage);
    firePaste(passage);
    firePaste(passage);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still posts an alert when nothing was ever copied in the app (genuinely external paste)', () => {
    firePaste('x'.repeat(500));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks the pasted range in the document so the passage can be found while reading the work', () => {
    editor!.commands.focus('end');
    firePaste('x'.repeat(200));

    const html = editor!.getHTML();
    expect(html).toContain('data-pasted-source="external"');
    expect(html).toContain(`>${'x'.repeat(200)}<`);
  });

  it('does not mark the document when the paste came from inside the app', () => {
    const passage = 'a passage the student copied from their own outline '.repeat(5);
    markInternalCopy(passage);

    editor!.commands.focus('end');
    firePaste(passage);

    expect(editor!.getHTML()).not.toContain('data-pasted-source');
  });

  it('does not mark the document for a paste under the threshold', () => {
    editor!.commands.focus('end');
    firePaste('x'.repeat(199));

    expect(editor!.getHTML()).not.toContain('data-pasted-source');
  });
});
