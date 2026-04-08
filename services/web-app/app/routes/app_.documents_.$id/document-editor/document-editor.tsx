import { useEffect, useState } from 'react';
import { documentStore } from '~/utils/document-store';
import type { SyncStatus } from '~/utils/sync-service';
import { Editor } from './editor';
import type { EditorBridge } from './use-editor-sync';

type Props = {
  docId: string;
  serverHtml: string;
  serverText: string;
  serverUpdatedAt: string | Date;
  initialRevision: number;
  isEditable: boolean;
  onBridgeReady: (bridge: EditorBridge | null) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onCommentCreated?: (comment: { id: string }) => void;
};

type HydratedContent = {
  html: string;
  text: string;
  source: 'server' | 'local';
};

export function DocumentEditor({
  docId,
  serverHtml,
  serverText,
  serverUpdatedAt,
  initialRevision,
  isEditable,
  onBridgeReady,
  onSyncStatusChange,
  onCommentCreated,
}: Props) {
  const [hydrated, setHydrated] = useState<HydratedContent | null>(null);

  // IDB-aware hydration: pick whichever source is newer.
  // Runs once on mount per docId.
  useEffect(() => {
    let cancelled = false;
    documentStore
      .get(docId)
      .then((entry) => {
        if (cancelled) return;
        if (entry && entry.updatedAt > new Date(serverUpdatedAt).getTime()) {
          setHydrated({ html: entry.html, text: entry.text, source: 'local' });
        } else {
          setHydrated({ html: serverHtml, text: serverText, source: 'server' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHydrated({ html: serverHtml, text: serverText, source: 'server' });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  if (!hydrated) {
    // Skeleton while we wait for the IDB read
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        Loading editor…
      </div>
    );
  }

  return (
    <Editor
      docId={docId}
      initialHtml={hydrated.html}
      initialRevision={initialRevision}
      isEditable={isEditable}
      onBridgeReady={onBridgeReady}
      onSyncStatusChange={onSyncStatusChange}
      onCommentCreated={onCommentCreated}
    />
  );
}
