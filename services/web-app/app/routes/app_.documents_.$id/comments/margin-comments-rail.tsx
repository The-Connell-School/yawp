import { Comment, type Comment as CommentType } from './comment';
import { DocumentMarginComments } from '../document-editor/document-margin-comments';
import { useEditorChrome } from '../document-editor/editor-chrome-context';

type Props = {
  comments: CommentType[];
  readOnly?: boolean;
  onCommentRemoved?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
  autoFocusReplyCommentId?: string | null;
};

export function MarginCommentsRail({
  comments,
  readOnly = false,
  onCommentRemoved,
  onResponseAdded,
  autoFocusReplyCommentId,
}: Props) {
  const { contentRoot, scrollRoot } = useEditorChrome();

  if (comments.length === 0) return null;

  return (
    <DocumentMarginComments
      contentRoot={contentRoot}
      scrollRoot={scrollRoot}
      commentIds={comments.map((c) => c.id)}
    >
      {(id) => {
        const comment = comments.find((c) => c.id === id);
        if (!comment) return null;
        return (
          <Comment
            {...comment}
            layout="margin"
            readOnly={readOnly}
            onDelete={onCommentRemoved}
            onResponseAdded={onResponseAdded}
            autoFocusReply={autoFocusReplyCommentId === comment.id}
          />
        );
      }}
    </DocumentMarginComments>
  );
}