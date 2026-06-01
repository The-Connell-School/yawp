import { type Fetcher, useFetchers } from 'react-router';
import { MessageCircleOff, MessageCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { Button } from '~/components/ui/button';
import { useUser } from '~/hooks/useUser';
import { cn } from '~/utils/misc';
import { Comment, type Comment as CommentType } from './comment';
import { useCommentsSelection } from './selection-context';

type Props = {
  comments: CommentType[];
  readOnly?: boolean;
  showCollapsibleHeader?: boolean;
  onCommentRemoved?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
  autoFocusReplyCommentId?: string | null;
};

type ExtendedProps = Props & { className?: string };

export const Comments = ({
  comments,
  readOnly = false,
  showCollapsibleHeader = true,
  className,
  onCommentRemoved,
  onResponseAdded,
  autoFocusReplyCommentId,
}: ExtendedProps) => {
  const user = useUser();
  const fetcher = useFetchers().find(
    (f) => f.key === 'create-document-comment'
  );
  const { activeCommentId, setActiveCommentId } = useCommentsSelection();
  const [commentsExpanded, setCommentsExpanded] = useLocalStorage(
    `commentsExpanded-${comments[0]?.documentId}`,
    true
  );

  // Click outside any mark or comment card clears the active selection.
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

  // Scroll the active comment card into view when selection changes.
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
          profile: user.selectedProfile as any,
          profileId: user.selectedProfile!.id,
          id: 'optimistic-document-comment',
          createdAt: new Date(),
          content: fetcher.formData.get('content') as string,
          highlightId: fetcher.formData.get('highlightId') as string,
          archivedAt: null,
          responses: [],
          documentId: '',
        }
      : [];
  const isExpanded = showCollapsibleHeader ? commentsExpanded : true;

  return (
    <div
      className={cn(
        'no-scrollbar h-full w-full overflow-y-scroll',
        className
      )}
    >
      {showCollapsibleHeader ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCommentsExpanded(!commentsExpanded)}
          className="w-full flex items-center justify-center py-2 rounded-none h-[41px] border-b"
        >
          {commentsExpanded ? (
            <MessageCircleOff size={18} />
          ) : (
            <MessageCircle size={18} />
          )}
          <span className="ml-2">
            {commentsExpanded ? 'Hide' : 'Show'} Comments
          </span>
        </Button>
      ) : null}
      <div
        className={cn(
          'no-scrollbar flex grow flex-col gap-2 transition-all duration-300',
          isExpanded
            ? 'max-h-full p-2 overflow-scroll'
            : 'max-h-0 overflow-hidden'
        )}
      >
        {comments.length > 0 ? (
          <>
            {comments.concat(optimisticComment).map((comment) => (
              <Comment
                key={comment.id}
                {...comment}
                readOnly={readOnly}
                onDelete={onCommentRemoved}
                onResponseAdded={onResponseAdded}
                autoFocusReply={autoFocusReplyCommentId === comment.id}
              />
            ))}
          </>
        ) : (
          <p className="my-auto h-full p-4 text-center text-muted-foreground">
            No comments yet.
          </p>
        )}
      </div>
    </div>
  );
};

const useFocusOptimisticComment = (fetcher: Fetcher | undefined) => {
  useEffect(() => {
    if (fetcher && fetcher.state === 'idle' && fetcher.data) {
      const comment = document.getElementById(`comment-${fetcher.data.id}`);
      if (comment) {
        comment.scrollIntoView({ behavior: 'smooth' });
        comment.classList.add('bg-primary/20', 'shadow-lg');
      }
    }
  }, [fetcher]);
};
