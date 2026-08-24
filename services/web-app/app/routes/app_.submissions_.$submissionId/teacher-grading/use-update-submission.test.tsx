import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useUpdateSubmission } from './use-update-submission';

const originalFetch = globalThis.fetch;

function TestHarness({
  submissionId,
  onReady,
}: {
  submissionId: string;
  onReady: (save: (fields: Record<string, unknown>) => Promise<void>) => void;
}) {
  const { save } = useUpdateSubmission(
    submissionId,
    '2026-08-20T12:00:00.000Z'
  );
  onReady(save);
  return null;
}

describe('useUpdateSubmission', () => {
  let root: Root | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    document.body.innerHTML = '';
    globalThis.fetch = originalFetch;
  });

  async function triggerSave(fields: Record<string, unknown>) {
    let save: ((fields: Record<string, unknown>) => Promise<void>) | null =
      null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <TestHarness
          submissionId="sub-1"
          onReady={(fn) => {
            save = fn;
          }}
        />
      );
    });

    let ok = true;
    let message: string | undefined;
    await act(async () => {
      try {
        await save!(fields);
      } catch (err) {
        ok = false;
        message = (err as Error).message;
      }
    });
    return { ok, message };
  }

  it('surfaces the server error message on a failed save instead of a generic message', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            message:
              'This submission was unsubmitted before you could grade it. Please refresh the page.',
          }),
          { status: 409 }
        )
    ) as unknown as typeof fetch;

    const result = await triggerSave({ score: '90% A' });

    expect(result).toEqual({
      ok: false,
      message:
        'This submission was unsubmitted before you could grade it. Please refresh the page.',
    });
  });

  it('falls back to a generic message when the server response has no message', async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({}), { status: 500 })
    ) as unknown as typeof fetch;

    const result = await triggerSave({ score: '90% A' });

    expect(result).toEqual({ ok: false, message: 'Save failed' });
  });

  it('resolves successfully when the save succeeds', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ success: true }), { status: 200 })
    ) as unknown as typeof fetch;

    const result = await triggerSave({ score: '90% A' });

    expect(result).toEqual({ ok: true, message: undefined });
  });

  it('sends the page-load version and advances it after each successful save', async () => {
    const requests: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          success: true,
          submission: {
            updatedAt:
              requests.length === 1
                ? '2026-08-20T12:01:00.000Z'
                : '2026-08-20T12:02:00.000Z',
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    let save: ((fields: Record<string, unknown>) => Promise<void>) | null =
      null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <TestHarness submissionId="sub-1" onReady={(fn) => (save = fn)} />
      );
    });

    await act(async () => {
      await save!({ score: '90% A-' });
      await save!({ score: '91% A-' });
    });

    expect(requests[0]?.expectedUpdatedAt).toBe('2026-08-20T12:00:00.000Z');
    expect(requests[1]?.expectedUpdatedAt).toBe('2026-08-20T12:01:00.000Z');
  });
});
