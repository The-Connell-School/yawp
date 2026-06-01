import { useEffect, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { formatDateOnly } from '~/utils/date-only';
import { documentStore } from '~/utils/document-store';
import type { SyncStatus } from '~/utils/sync-service';
import { Editor } from './editor';
import type { EditorBridge } from './use-editor-sync';

type AssignmentPrompt = {
  title: string | null;
  prompt: string | null;
  dueDate: string | Date | null;
};

type Props = {
  docId: string;
  assignment?: AssignmentPrompt | null;
  serverHtml: string;
  serverText: string;
  serverUpdatedAt: string | Date;
  initialRevision: number;
  isEditable: boolean;
  onBridgeReady: (bridge: EditorBridge | null) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onSubmittableContentChange?: (submittable: boolean) => void;
  onCommentCreated?: (comment: unknown) => void;
};

type HydratedContent = {
  html: string;
  text: string;
  source: 'server' | 'local';
};

export function DocumentEditor({
  docId,
  assignment,
  serverHtml,
  serverText,
  serverUpdatedAt,
  initialRevision,
  isEditable,
  onBridgeReady,
  onSyncStatusChange,
  onSubmittableContentChange,
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

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <AssignmentPromptBanner assignment={assignment} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {!hydrated ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            Loading editor…
          </div>
        ) : (
          <Editor
            docId={docId}
            initialHtml={hydrated.html}
            initialRevision={initialRevision}
            isEditable={isEditable}
            onBridgeReady={onBridgeReady}
            onSyncStatusChange={onSyncStatusChange}
            onSubmittableContentChange={onSubmittableContentChange}
            onCommentCreated={onCommentCreated}
          />
        )}
      </div>
    </div>
  );
}

function AssignmentPromptBanner({
  assignment,
}: {
  assignment?: AssignmentPrompt | null;
}) {
  if (!assignment?.prompt?.trim()) return null;

  return (
    <div
      className="shrink-0 border-b bg-amber-50 px-3 py-3"
      data-testid="assignment-prompt-panel"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info-outlined" size="sm">
            Assignment Prompt
          </Badge>
          <span className="text-sm font-medium">
            {assignment.title?.trim() || 'Untitled Assignment'}
          </span>
          {assignment.dueDate ? (
            <span className="text-xs text-muted-foreground">
              Due {formatDateOnly(assignment.dueDate)}
            </span>
          ) : null}
        </div>
        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-foreground/90">
          {assignment.prompt}
        </p>
      </div>
    </div>
  );
}
