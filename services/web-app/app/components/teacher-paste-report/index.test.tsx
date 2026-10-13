import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TeacherPasteReport } from './index';

const originalFetch = globalThis.fetch;

function renderWithContent(contentRoot: HTMLElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TeacherPasteReport
        enabled
        documentId="doc-1"
        contentRoot={contentRoot}
      >
        <p>Teacher comments</p>
      </TeacherPasteReport>
    );
  });

  return root;
}

describe('TeacherPasteReport', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    document.body.innerHTML = '';
    globalThis.fetch = originalFetch;
  });

  it('shows a quiet empty state when the document has no pasted text', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ events: [], nextCursor: null }), {
          status: 200,
        })
    ) as unknown as typeof fetch;
    const contentRoot = document.createElement('div');
    contentRoot.textContent = 'Original student writing with no paste marks.';

    root = renderWithContent(contentRoot);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Pasted text report"]')
        ?.click();
    });

    expect(
      document.querySelector('[data-testid="paste-report-empty"]')
    ).not.toBeNull();
    expect(document.body.textContent).toContain('No pasted text found');
    expect(document.body.textContent).not.toContain(
      'Copied percentage unknown'
    );
    expect(document.body.textContent).not.toContain('Lower-bound signal');
  });

  it('shows persisted paste events even when no linked text remains', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            events: [
              {
                id: 'paste_12345678-1234-4321-8123-123456789abc',
                createdAt: '2026-10-13T12:34:56.000Z',
                textLength: 240,
                sourceUrl: null,
              },
            ],
            nextCursor: null,
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;
    const contentRoot = document.createElement('div');
    contentRoot.textContent =
      'The pasted passage was later edited until the linked span disappeared.';

    root = renderWithContent(contentRoot);
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Pasted text report"]')
        ?.click();
    });

    expect(
      document.querySelector('[data-testid="paste-report-empty"]')
    ).toBeNull();
    expect(document.body.textContent).toContain('Recorded events');
    expect(document.body.textContent).toContain('240 chars');
    expect(document.body.textContent).toContain(
      'No linked text remains in this version'
    );
  });
});
