import { MessageCircleOff, MessageCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import { Comment, type Comment as CommentType } from './comment';
import { useCommentsSelection } from './selection-context';

type Props = {
  comments: CommentType[];
  readOnly?: boolean;
  onResponseCreated?: (commentId: string, response: any) => void;
};

type ExtendedProps = Props & { className?: string };

export const Comments = ({
  comments,
  readOnly = false,
  className,
  onResponseCreated,
}: ExtendedProps) => {
  const { activeCommentId, setActiveCommentId } = useCommentsSelection();
  const [commentsExpanded, setCommentsExpanded] = useLocalStorage(
    `commentsExpanded-${comments[0]?.documentId}`,
    true
  );

  useBlurComments(comments);

  return (
    <div
      className={cn(
        'no-scrollbar h-full w-full overflow-y-scroll md:w-3/5',
        className
      )}
    >
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
      <div
        className={cn(
          'no-scrollbar flex grow flex-col gap-2 transition-all duration-300',
          commentsExpanded
            ? 'max-h-full p-2 overflow-scroll'
            : 'max-h-0 overflow-hidden'
        )}
      >
        {comments.length > 0 ? (
          <>
            {comments.map((comment) => (
              <Comment
                key={comment.id}
                {...comment}
                readOnly={readOnly}
                onResponseCreated={onResponseCreated}
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

const useBlurComments = (comments: CommentType[]) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      comments.forEach((comment) => {
        const commentElement = document.getElementById(`comment-${comment.id}`);
        const commentMarks = document.querySelectorAll(
          `[data-comment-id="${comment.id}"]`
        );
        const clickedElement = commentElement?.contains(event.target as Node);
        const clickedMark = Array.from(commentMarks).some((el) =>
          el.contains(event.target as Node)
        );

        if (clickedElement || clickedMark) {
          return;
        }

        commentElement?.classList.remove('bg-primary/20', 'shadow-lg');
        commentElement?.removeAttribute('data-comment-active');
        commentMarks.forEach((el) =>
          (el as HTMLElement).classList.remove('focused')
        );
      });
    };

    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [comments]);
};
