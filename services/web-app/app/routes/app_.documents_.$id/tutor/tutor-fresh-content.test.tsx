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

const postTutorResponseWithFallbackRetry = mock();
const actualReactRouter = await import('react-router');

mock.module('react-router', () => ({
  ...actualReactRouter,
  useNavigate: () => () => {},
  useNavigation: () => ({ state: 'idle' }),
  useSearchParams: () => [new URLSearchParams(), () => {}],
}));

mock.module('./tutor-response-retry', () => ({
  postTutorResponseWithFallbackRetry,
}));

const { Tutor } = await import('./tutor');

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return { root };
}

function cleanup(root: Root | null) {
  if (root) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = '';
  postTutorResponseWithFallbackRetry.mockReset();
}

function formEntries(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)])
  );
}

function renderTutor({
  beforeRespond,
  getCurrentDocumentText,
}: {
  beforeRespond: () => Promise<boolean>;
  getCurrentDocumentText: () => string;
}) {
  return render(
    <Tutor
      docId="doc-1"
      beforeRespond={beforeRespond}
      getCurrentDocumentText={getCurrentDocumentText}
      cms={{
        id: 'cms-1',
        instructionsCompleted: 0,
        assignmentModule: {
          title: 'Thesis',
          isSelfGuided: false,
          assignmentType: { assignmentModules: [{ id: 'module-1', position: 0 }] },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Draft',
              prompt: 'Ask for feedback.',
              showChatButton: false,
              showNextButton: false,
              buttons: [
                {
                  id: 'button-1',
                  label: 'Review my draft',
                  action: 'response',
                },
              ],
            },
          ],
        },
        messages: [],
      }}
    />
  );
}

describe('Tutor fresh document handoff', () => {
  let root: Root | null = null;

  afterEach(() => {
    cleanup(root);
    root = null;
  });

  it('awaits the pre-send flush before reading document text for the tutor API', async () => {
    let currentDocumentText = 'stale text before flush';
    const beforeRespond = mock(async () => {
      currentDocumentText = 'fresh text after one-second edit';
      return true;
    });
    postTutorResponseWithFallbackRetry.mockResolvedValue({
      response: new Response(JSON.stringify({ cms: { id: 'cms-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      json: { cms: { id: 'cms-1' } },
    });

    ({ root } = renderTutor({
      beforeRespond,
      getCurrentDocumentText: () => currentDocumentText,
    }));

    const responseButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('Review my draft'));
    expect(responseButton).not.toBeUndefined();

    await act(async () => {
      responseButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(beforeRespond).toHaveBeenCalledTimes(1);
    expect(postTutorResponseWithFallbackRetry).toHaveBeenCalledTimes(1);
    const formData = postTutorResponseWithFallbackRetry.mock.calls[0]?.[0]
      .formData as FormData;
    expect(formEntries(formData)).toEqual({
      response: 'Review my draft',
      cmsId: 'cms-1',
      content: 'fresh text after one-second edit',
    });
  });
});
