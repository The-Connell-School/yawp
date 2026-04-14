import { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { documentStore } from '~/utils/document-store';
import { SyncService, type SyncStatus } from '~/utils/sync-service';
import { contentHash } from '~/utils/content-hash';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';

export const REVISION_INTERVAL_MS = 5 * 60 * 1000;

export type EditorBridge = {
  getContent: () => { html: string; text: string };
  saveNow: (options?: { source?: string }) => Promise<void>;
};

type RevisionSchedulerOptions = {
  intervalMs: number;
  getHash: () => Promise<string>;
  fireRevision: () => Promise<void>;
};

/**
 * Pure factory: creates a scheduler that fires `fireRevision` after `intervalMs`
 * of idle time, but only if the content hash has changed since the last fire.
 * Each call to `schedule()` resets the timer (idle-reset behavior).
 */
export function createRevisionScheduler(opts: RevisionSchedulerOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFiredHash: string | null = null;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    cancel();
    timer = setTimeout(async () => {
      timer = null;
      const hash = await opts.getHash();
      if (hash === lastFiredHash) return; // dedup
      await opts.fireRevision();
      lastFiredHash = hash;
    }, opts.intervalMs);
  };

  return { schedule, cancel };
}

type UseEditorSyncOptions = {
  docId: string;
  initialRevision?: number;
  onBridgeReady: (bridge: EditorBridge | null) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  /** Fires when TipTap content changes; aligns with server submit rules (non-empty html + text). */
  onSubmittableContentChange?: (submittable: boolean) => void;
};

/**
 * The persistence hook. Owns the localVersion counter, IDB writes,
 * SyncService scheduling, the 5-min revision timer, and the bridge
 * exposed to the parent.
 */
export function useEditorSync(
  editor: Editor | null,
  {
    docId,
    initialRevision = 0,
    onBridgeReady,
    onSyncStatusChange,
    onSubmittableContentChange,
  }: UseEditorSyncOptions
) {
  const versionRef = useRef(0);
  const currentRevisionRef = useRef(initialRevision);
  const syncServiceRef = useRef<SyncService | null>(null);
  const schedulerRef = useRef<ReturnType<typeof createRevisionScheduler> | null>(null);

  const getSnapshot = useCallback(() => {
    if (!editor) return { html: '', text: '' };
    return {
      html: editor.getHTML(),
      text: editor.getText().replace(/\u00A0/g, ' '),
    };
  }, [editor]);

  // Sync service + revision scheduler lifecycle (mount/unmount)
  useEffect(() => {
    if (!docId) return;

    const sync = new SyncService(documentStore);
    syncServiceRef.current = sync;
    sync.start(docId);

    // Initialize localVersion from IDB if present
    void documentStore.get(docId).then((entry) => {
      if (entry?.localVersion) {
        versionRef.current = entry.localVersion;
      }
    });

    // Subscribe to status changes
    const unsubStatus = onSyncStatusChange ? sync.onStatusChange(onSyncStatusChange) : undefined;

    // Keep currentRevisionRef in sync when the server advances the revision
    // (e.g. on 409 stale_base_revision recovery)
    const unsubRevision = sync.onRevisionUpdate((rev) => {
      currentRevisionRef.current = rev;
    });

    // Set up the revision scheduler
    schedulerRef.current = createRevisionScheduler({
      intervalMs: REVISION_INTERVAL_MS,
      getHash: async () => {
        const { html, text } = getSnapshot();
        return contentHash(html, text);
      },
      fireRevision: async () => {
        await sync.forceSave({ trigger: 'periodic' });
      },
    });

    // Visibility-change → flush
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void sync.forceSave({ trigger: 'session-end' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      void sync.forceSave({ trigger: 'session-end' });
      sync.stop();
      schedulerRef.current?.cancel();
      schedulerRef.current = null;
      syncServiceRef.current = null;
      unsubStatus?.();
      unsubRevision();
    };
  }, [docId, onSyncStatusChange, getSnapshot]);

  // Editor update handler: write IDB + schedule sync + reset revision timer
  useEffect(() => {
    if (!editor) return;

    const handler = async () => {
      const { html, text } = getSnapshot();
      const hash = await contentHash(html, text);
      versionRef.current += 1;
      await documentStore.put({
        docId,
        html,
        text,
        updatedAt: Date.now(),
        localVersion: versionRef.current,
        serverRevision: currentRevisionRef.current,
        syncStatus: 'pending',
        lastSyncedAt: null,
        lastSyncError: null,
        contentHash: hash,
      });
      syncServiceRef.current?.scheduleSave();
      schedulerRef.current?.schedule();
    };

    editor.on('update', handler);

    // Signal to E2E tests that the sync handler is wired up.
    // We use requestAnimationFrame to ensure ProseMirror's own DOM
    // event listeners have been fully installed before tests type.
    const dom = editor.view.dom as HTMLElement;
    dom.dataset.saveCount = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dom.dataset.syncReady = 'true';
      });
    });

    // Expose save count via DOM for E2E tests to poll
    const unsubSaveCount = syncServiceRef.current?.onStatusChange((status) => {
      if (status === 'synced') {
        const count = parseInt(dom.dataset.saveCount ?? '0', 10);
        dom.dataset.saveCount = String(count + 1);
      }
    });

    return () => {
      editor.off('update', handler);
      delete dom.dataset.syncReady;
      delete dom.dataset.saveCount;
      unsubSaveCount?.();
    };
  }, [editor, docId, getSnapshot]);

  // Keep parent in sync for submit affordances (disabled + tooltip when empty)
  useEffect(() => {
    if (!editor || !onSubmittableContentChange) return;
    const emit = () => {
      const { html, text } = getSnapshot();
      onSubmittableContentChange(isDocumentSubmittableContent(html, text));
    };
    emit();
    editor.on('update', emit);
    return () => {
      editor.off('update', emit);
    };
  }, [editor, getSnapshot, onSubmittableContentChange]);

  // Expose bridge upward (no setContent — that's the architectural property)
  useEffect(() => {
    if (!editor) {
      onBridgeReady(null);
      return;
    }

    const bridge: EditorBridge = {
      getContent: getSnapshot,
      saveNow: async (options) => {
        const { html, text } = getSnapshot();
        const hash = await contentHash(html, text);
        versionRef.current += 1;
        await documentStore.put({
          docId,
          html,
          text,
          updatedAt: Date.now(),
          localVersion: versionRef.current,
          serverRevision: currentRevisionRef.current,
          syncStatus: 'pending',
          lastSyncedAt: null,
          lastSyncError: null,
          contentHash: hash,
        });
        await syncServiceRef.current?.forceSave({ trigger: options?.source ?? 'manual' });
      },
    };

    onBridgeReady(bridge);
    return () => onBridgeReady(null);
  }, [editor, docId, getSnapshot, onBridgeReady]);
}
