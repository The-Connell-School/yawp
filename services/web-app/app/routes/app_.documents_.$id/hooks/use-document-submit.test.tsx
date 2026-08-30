import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EditorBridge } from '../document-editor/use-editor-sync';

const toastError = mock();
const toastSuccess = mock();
mock.module('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const { useDocumentSubmit } = await import('./use-document-submit');

type SubmitApi = ReturnType<typeof useDocumentSubmit>;

function Harness({
  editorBridgeRef,
  onReady,
  onSubmitted,
}: {
  editorBridgeRef: RefObject<EditorBridge | null>;
  onReady: (api: SubmitApi) => void;
  onSubmitted: (submission: {
    id: string;
    title: string;
    submittedAt: string;
  }) => void;
}) {
  onReady(
    useDocumentSubmit({
      documentId: 'doc-1',
      editorBridgeRef,
      onSubmitted,
    })
  );
  return null;
}

describe('useDocumentSubmit', () => {
  let root: Root | null = null;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    document.body.innerHTML = '';
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = '';
    globalThis.fetch = originalFetch;
  });

  async function submitWithSaveStatus(
    status: 'synced' | 'offline' | 'auth-expired' | 'error'
  ) {
    const saveNow = mock(async () => status);
    const editorBridgeRef = {
      current: {
        getContent: () => ({ html: '<p>latest</p>', text: 'latest' }),
        saveNow,
      },
    } as RefObject<EditorBridge>;
    const onSubmitted = mock();
    const fetchMock = mock(async () =>
      Response.json({
        submission: {
          id: 'sub-new',
          title: 'Revision',
          submittedAt: '2026-08-30T12:00:00.000Z',
        },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    let api: SubmitApi | null = null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <Harness
          editorBridgeRef={editorBridgeRef}
          onReady={(value) => {
            api = value;
          }}
          onSubmitted={onSubmitted}
        />
      );
    });

    await act(async () => {
      await api?.submitNow('Revision');
    });

    return { saveNow, fetchMock, onSubmitted };
  }

  for (const status of ['offline', 'auth-expired', 'error'] as const) {
    it(`does not create a submission when the forced save ends ${status}`, async () => {
      const { saveNow, fetchMock, onSubmitted } =
        await submitWithSaveStatus(status);

      expect(saveNow).toHaveBeenCalledWith({ source: 'pre-submit-flush' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(onSubmitted).not.toHaveBeenCalled();
    });
  }

  it('submits only after the forced save reports synced', async () => {
    const { fetchMock, onSubmitted } = await submitWithSaveStatus('synced');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSubmitted).toHaveBeenCalledWith({
      id: 'sub-new',
      title: 'Revision',
      submittedAt: '2026-08-30T12:00:00.000Z',
    });
  });
});
