import { Comment, type Comment as CommentType } from './comment';
import { DocumentMarginComments } from '../document-editor/document-margin-comments';
import { useEditorChrome } from '../document-editor/editor-chrome-context';
import { MarginCommentDraftCard } from './margin-comment-draft-card';
import type { PendingCommentDraft } from '../hooks/use-comments-state';

type Props = {
  comments: CommentType[];
  documentId: string;
  readOnly?: boolean;
  pendingDraft?: PendingCommentDraft | null;
  onCommentRemoved?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
  onArchiveChange?: (commentId: string, archivedAt: Date | null) => void;
  onCommentCreated?: (comment: unknown) => void;
  onDraftCommitted?: () => void;
  onDraftCancel?: () => void;
  autoFocusReplyCommentId?: string | null;
};

export function MarginCommentsRail({
  comments,
  documentId,
  readOnly = false,
  pendingDraft,
  onCommentRemoved,
  onResponseAdded,
  onArchiveChange,
  onCommentCreated,
  onDraftCommitted,
  onDraftCancel,
  autoFocusReplyCommentId,
}: Props) {
  const { contentRoot, scrollRoot } = useEditorChrome();

  const commentIds = [
    ...(pendingDraft ? [pendingDraft.id] : []),
    ...comments.map((c) => c.id),
  ];

  if (commentIds.length === 0) return null;

  return (
    <DocumentMarginComments
      contentRoot={contentRoot}
      scrollRoot={scrollRoot}
      commentIds={commentIds}
    >
      {(id) => {
        if (pendingDraft?.id === id) {
          return (
            <MarginCommentDraftCard
              documentId={documentId}
              draftId={pendingDraft.id}
              excerpt={pendingDraft.excerpt}
              onCancel={() => onDraftCancel?.()}
              onCreated={(c) => {
                onCommentCreated?.(c);
                onDraftCommitted?.();
              }}
            />
          );
        }
        const comment = comments.find((c) => c.id === id);
        if (!comment) return null;
        return (
          <Comment
            {...comment}
            layout="margin"
            readOnly={readOnly}
            onDelete={onCommentRemoved}
            onResponseAdded={onResponseAdded}
            onArchiveChange={onArchiveChange}
            autoFocusReply={autoFocusReplyCommentId === comment.id}
          />
        );
      }}
    </DocumentMarginComments>
  );
}