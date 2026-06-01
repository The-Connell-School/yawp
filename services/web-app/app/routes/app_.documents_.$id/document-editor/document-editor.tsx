import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { formatDateOnly } from '~/utils/date-only';
import { documentStore } from '~/utils/document-store';
import type { SyncStatus } from '~/utils/sync-service';
import { Editor } from './editor';
import type { EditorBridge } from './use-editor-sync';

const PROMPT_EXPANDED_MAX_HEIGHT = 'calc(50vh - 28px)';

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
      <AssignmentPromptBanner docId={docId} assignment={assignment} />
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
  docId,
  assignment,
}: {
  docId: string;
  assignment?: AssignmentPrompt | null;
}) {
  const [isCollapsed, setIsCollapsed] = useLocalStorage(
    `assignmentPromptCollapsed-${docId}`,
    false
  );

  if (!assignment?.prompt?.trim()) return null;

  return (
    <div
      className="shrink-0 border-b bg-amber-50"
      data-testid="assignment-prompt-panel"
    >
      <div className="px-3 py-2">
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Badge variant="info-outlined" size="sm">
              Assignment Prompt
            </Badge>
            <span className="min-w-0 truncate text-sm font-medium">
              {assignment.title?.trim() || 'Untitled Assignment'}
            </span>
            {assignment.dueDate ? (
              <span className="text-xs text-muted-foreground">
                Due {formatDateOnly(assignment.dueDate)}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              isCollapsed
                ? 'Expand assignment prompt'
                : 'Collapse assignment prompt'
            }
            onClick={() => setIsCollapsed((value) => !value)}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
        {!isCollapsed ? (
          <div
            className="mt-2 overflow-y-auto whitespace-pre-wrap text-sm text-foreground/90"
            style={{ maxHeight: PROMPT_EXPANDED_MAX_HEIGHT }}
          >
            {assignment.prompt}
          </div>
        ) : null}
      </div>
    </div>
  );
}
