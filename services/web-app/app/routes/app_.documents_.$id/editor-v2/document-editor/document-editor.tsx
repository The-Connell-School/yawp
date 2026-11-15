import { useEffect, useState, type ReactNode } from 'react';
import { documentStore } from '~/utils/document-store';
import type { SyncStatus } from '~/utils/sync-service';
import { Editor } from './editor';
import type { EditorBridge } from './use-editor-sync';
import type { AssignmentPrompt } from './assignment-prompt-banner';
import type { PageWidthMode } from './toolbar-controls';

export type { AssignmentPrompt } from './assignment-prompt-banner';

type Props = {
  docId: string;
  assignment?: AssignmentPrompt | null;
  serverHtml: string;
  serverText: string;
  serverUpdatedAt: string | Date;
  initialRevision: number;
  isEditable: boolean;
  teacherCommenting?: boolean;
  canUploadImages?: boolean;
  onBridgeReady: (bridge: EditorBridge | null) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onSubmittableContentChange?: (submittable: boolean) => void;
  onCommentDraft?: (draft: { id: string; excerpt: string }) => void;
  onCommentCreated?: (comment: unknown) => void;
  marginComments?: ReactNode;
  pageWidth?: PageWidthMode;
  onPageWidthChange?: (mode: PageWidthMode) => void;
  submissionViewBanner?: ReactNode;
  /** When set, skip IndexedDB and mount this snapshot (submission preview). */
  snapshotContent?: { html: string; text: string } | null;
};

type HydratedContent = {
  html: string;
  text: string;
  source: 'server' | 'local' | 'snapshot';
};

export function EditorLoadingShell() {
  return (
    <div
      className="flex h-full w-full min-w-0 flex-col overflow-hidden"
      data-testid="document-editor-loading"
      aria-busy="true"
    >
      <div className="doc-editor-toolbar-glass mx-4 mt-2 h-[42px] opacity-60" />
      <div className="doc-editor-scroll flex-1">
        <article className="doc-editor-loading-page opacity-70">
          <div className="space-y-3" aria-hidden>
            <div className="h-3 w-[92%] rounded bg-muted" />
            <div className="h-3 w-[88%] rounded bg-muted" />
            <div className="h-3 w-[75%] rounded bg-muted" />
          </div>
        </article>
      </div>
    </div>
  );
}

export function DocumentEditor({
  docId,
  assignment,
  serverHtml,
  serverText,
  serverUpdatedAt,
  initialRevision,
  isEditable,
  teacherCommenting = false,
  canUploadImages = false,
  onBridgeReady,
  onSyncStatusChange,
  onSubmittableContentChange,
  onCommentDraft,
  onCommentCreated,
  marginComments,
  pageWidth,
  onPageWidthChange,
  submissionViewBanner,
  snapshotContent = null,
}: Props) {
  const [hydrated, setHydrated] = useState<HydratedContent | null>(() =>
    snapshotContent
      ? {
          html: snapshotContent.html,
          text: snapshotContent.text,
          source: 'snapshot',
        }
      : null
  );

  useEffect(() => {
    if (snapshotContent) {
      setHydrated({
        html: snapshotContent.html,
        text: snapshotContent.text,
        source: 'snapshot',
      });
      return;
    }
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
  }, [docId, snapshotContent?.html, snapshotContent?.text]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {!hydrated ? (
          <EditorLoadingShell />
        ) : (
          <Editor
            key={
              hydrated.source === 'snapshot'
                ? `snapshot-${hydrated.html.length}`
                : docId
            }
            docId={docId}
            initialHtml={hydrated.html}
            initialRevision={initialRevision}
            isEditable={isEditable && hydrated.source !== 'snapshot'}
            teacherCommenting={teacherCommenting}
            canUploadImages={canUploadImages}
            onBridgeReady={onBridgeReady}
            onSyncStatusChange={onSyncStatusChange}
            onSubmittableContentChange={onSubmittableContentChange}
            onCommentDraft={onCommentDraft}
            onCommentCreated={onCommentCreated}
            assignment={assignment}
            marginComments={marginComments}
            pageWidth={pageWidth}
            onPageWidthChange={onPageWidthChange}
            submissionViewBanner={submissionViewBanner}
          />
        )}
      </div>
    </div>
  );
}