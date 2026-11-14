import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EditorBridge } from './use-editor-sync';

let resolveStoredDraft: ((entry: any) => void) | null = null;
const getStoredDraft = mock(
  () =>
    new Promise<any>((resolve) => {
      resolveStoredDraft = resolve;
    })
);

mock.module('~/utils/document-store', () => ({
  documentStore: { get: getStoredDraft },
}));

const mountedInitialHtml: string[] = [];
const hydratedBridge: EditorBridge = {
  getContent: () => ({
    html: '<p>newer local draft</p>',
    text: 'newer local draft',
  }),
  saveNow: mock(async () => 'synced' as const),
};

mock.module('./editor', () => ({
  Editor: (props: {
    initialHtml: string;
    onBridgeReady: (bridge: EditorBridge | null) => void;
  }) => {
    mountedInitialHtml.push(props.initialHtml);
    useEffect(() => {
      props.onBridgeReady(hydratedBridge);
      return () => props.onBridgeReady(null);
    }, [props.onBridgeReady]);
    return <div data-testid="hydrated-editor">{props.initialHtml}</div>;
  },
}));

const { DocumentEditor } = await import('./document-editor');

describe('DocumentEditor hydration boundary', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = '';
    resolveStoredDraft = null;
    mountedInitialHtml.length = 0;
    getStoredDraft.mockClear();
  });

  it('withholds the bridge until a newer local IndexedDB draft is mounted', async () => {
    const onBridgeReady = mock((_bridge: EditorBridge | null) => {});
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <DocumentEditor
          docId="doc-hydration-proof"
          serverHtml="<p>stale server draft</p>"
          serverText="stale server draft"
          serverUpdatedAt={new Date(1_000)}
          initialRevision={3}
          isEditable
          onBridgeReady={onBridgeReady}
        />
      );
    });

    expect(document.body.textContent).toContain('Loading editor…');
    expect(onBridgeReady).not.toHaveBeenCalled();
    expect(mountedInitialHtml).toEqual([]);

    await act(async () => {
      resolveStoredDraft?.({
        docId: 'doc-hydration-proof',
        html: '<p>newer local draft</p>',
        text: 'newer local draft',
        updatedAt: 2_000,
        localVersion: 4,
        serverRevision: 3,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: 'local-hash',
      });
      await Promise.resolve();
    });

    expect(mountedInitialHtml).toEqual(['<p>newer local draft</p>']);
    expect(document.body.textContent).toContain('newer local draft');
    expect(onBridgeReady).toHaveBeenCalledWith(hydratedBridge);
  });
});
