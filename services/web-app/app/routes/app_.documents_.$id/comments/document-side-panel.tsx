import { useEffect, useMemo, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { formatDateOnly } from '~/utils/date-only';
import { cn } from '~/utils/misc';
import { type Comment as CommentType } from './comment';
import { Comments } from './comments';
import { useCommentsSelection } from './selection-context';

type AssignmentPrompt = {
  title: string | null;
  prompt: string | null;
  dueDate: string | Date | null;
};

type Props = {
  assignment: AssignmentPrompt | null;
  comments: CommentType[];
  readOnly?: boolean;
  onCommentRemoved?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
  autoFocusReplyCommentId?: string | null;
};

export function DocumentSidePanel({
  assignment,
  comments,
  readOnly = false,
  onCommentRemoved,
  onResponseAdded,
  autoFocusReplyCommentId,
}: Props) {
  const hasPrompt = Boolean(assignment?.prompt?.trim());
  const initialTab = hasPrompt && comments.length === 0 ? 'prompt' : 'comments';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { activeCommentId } = useCommentsSelection();

  useEffect(() => {
    if (!hasPrompt && activeTab === 'prompt') {
      setActiveTab('comments');
    }
  }, [activeTab, hasPrompt]);

  useEffect(() => {
    if (activeCommentId || autoFocusReplyCommentId) {
      setActiveTab('comments');
    }
  }, [activeCommentId, autoFocusReplyCommentId]);

  const commentsLabel = useMemo(
    () => (comments.length > 0 ? `Comments (${comments.length})` : 'Comments'),
    [comments.length]
  );

  if (!hasPrompt || !assignment) {
    return (
      <aside
        className="h-full w-full shrink-0 border-l md:w-3/5"
        data-testid="document-side-panel"
      >
        <Comments
          comments={comments}
          readOnly={readOnly}
          onCommentRemoved={onCommentRemoved}
          onResponseAdded={onResponseAdded}
          autoFocusReplyCommentId={autoFocusReplyCommentId}
        />
      </aside>
    );
  }

  return (
    <aside
      className="h-full w-full shrink-0 border-l md:w-3/5"
      data-testid="document-side-panel"
    >
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex h-full flex-col"
      >
        <div className="border-b px-2 py-2">
          <TabsList className="grid h-9 w-full grid-cols-2">
            <TabsTrigger value="comments">{commentsLabel}</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="comments"
          className="m-0 min-h-0 flex-1 overflow-hidden"
        >
          <Comments
            comments={comments}
            readOnly={readOnly}
            showCollapsibleHeader={false}
            onCommentRemoved={onCommentRemoved}
            onResponseAdded={onResponseAdded}
            autoFocusReplyCommentId={autoFocusReplyCommentId}
          />
        </TabsContent>
        <TabsContent
          value="prompt"
          className="m-0 min-h-0 flex-1 overflow-hidden"
        >
          <AssignmentPromptPanel assignment={assignment} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function AssignmentPromptPanel({
  assignment,
}: {
  assignment: AssignmentPrompt;
}) {
  const dueDate = formatDateOnly(assignment.dueDate);

  return (
    <div
      className="h-full overflow-y-auto px-4 py-4"
      data-testid="assignment-prompt-panel"
    >
      <div className="space-y-4">
        <div className="space-y-2 border-l-4 border-yellow-400 pl-3">
          <Badge
            variant="outline"
            size="sm"
            className="border-yellow-300 bg-transparent text-yellow-800"
          >
            Assignment Prompt
          </Badge>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold leading-5">
              {assignment.title?.trim() || 'Untitled Assignment'}
            </h2>
            {dueDate ? (
              <p className="text-xs text-muted-foreground">Due {dueDate}</p>
            ) : null}
          </div>
        </div>
        <p
          className={cn(
            'whitespace-pre-wrap text-sm leading-6 text-foreground/90',
            'break-words'
          )}
        >
          {assignment.prompt}
        </p>
      </div>
    </div>
  );
}
