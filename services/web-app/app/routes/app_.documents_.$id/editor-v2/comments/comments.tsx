import { type Fetcher, useFetchers } from 'react-router';
import { useEffect } from 'react';
import { useUser } from '~/hooks/useUser';
import { cn } from '~/utils/misc';
import { Comment, type Comment as CommentType } from './comment';
import { useCommentsSelection } from './selection-context';

type Props = {
  comments: CommentType[];
  readOnly?: boolean;
  showCollapsibleHeader?: boolean;
  variant?: 'legacy' | 'sheet';
  openCommentCount?: number;
  onCommentRemoved?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
  onArchiveChange?: (commentId: string, archivedAt: Date | null) => void;
  autoFocusReplyCommentId?: string | null;
  showCollapseControl?: boolean;
};

type ExtendedProps = Props & { className?: string };

export const Comments = ({
  comments,
  readOnly = false,
  showCollapsibleHeader,
  variant = 'sheet',
  openCommentCount,
  className,
  onCommentRemoved,
  onResponseAdded,
  onArchiveChange,
  autoFocusReplyCommentId,
  showCollapseControl,
}: ExtendedProps) => {
  const user = useUser();
  const fetcher = useFetchers().find(
    (f) => f.key === 'create-document-comment'
  );
  const { activeCommentId, setActiveCommentId } = useCommentsSelection();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-comment-id]')) return;
      if (target.closest('[data-comment-card]')) return;
      setActiveCommentId(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [setActiveCommentId]);

  useEffect(() => {
    if (!activeCommentId) return;
    const card = document.querySelector(
      `[data-comment-card="${activeCommentId}"]`
    );
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeCommentId]);

  useFocusOptimisticComment(fetcher);

  const optimisticComment: CommentType | [] =
    !readOnly && fetcher?.formData
      ? {
          membership: user.selectedMembership as unknown as CommentType['membership'],
          membershipId: user.selectedMembership!.id,
          id: 'optimistic-document-comment',
          createdAt: new Date(),
          content: fetcher.formData.get('content') as string,
          highlightId: fetcher.formData.get('highlightId') as string,
          archivedAt: null,
          responses: [],
          documentId: '',
        }
      : [];

  const activeCount =
    openCommentCount ??
    comments.filter((comment) => !comment.archivedAt).length;

  return (
    <div
      data-tour="doc-comments"
      data-testid="document-comments-panel"
      className={cn(
        'no-scrollbar h-full w-full overflow-y-scroll',
        variant === 'sheet' && 'doc-editor-comments-sheet',
        className
      )}
    >
      {variant === 'sheet' ? (
        <div className="doc-editor-comments-sheet__hint">
          Tap highlighted text in the essay to jump to its comment.
        </div>
      ) : null}
      <div
        className={cn(
          'no-scrollbar flex grow flex-col gap-2',
          variant === 'sheet' ? 'p-0' : 'max-h-full overflow-scroll p-2'
        )}
      >
        {comments.length > 0 ? (
          comments.concat(optimisticComment).map((comment) => (
            <Comment
              key={comment.id}
              {...comment}
              layout="sidebar"
              surface="sheet"
              readOnly={readOnly}
              onDelete={onCommentRemoved}
              onResponseAdded={onResponseAdded}
              onArchiveChange={onArchiveChange}
              autoFocusReply={autoFocusReplyCommentId === comment.id}
            />
          ))
        ) : (
          <p className="my-auto h-full p-4 text-center text-[13px] text-[hsl(50_2.4%_36%)]">
            No comments yet.
          </p>
        )}
      </div>
      {variant === 'sheet' && activeCount > 0 ? (
        <span className="sr-only">{activeCount} open comments</span>
      ) : null}
    </div>
  );
};

const useFocusOptimisticComment = (fetcher: Fetcher | undefined) => {
  useEffect(() => {
    if (fetcher && fetcher.state === 'idle' && fetcher.data) {
      const comment = document.getElementById(`comment-${fetcher.data.id}`);
      if (comment) {
        comment.scrollIntoView({ behavior: 'smooth' });
        comment.classList.add('ring-2', 'ring-[hsl(40_90%_55%)]');
      }
    }
  }, [fetcher]);
};