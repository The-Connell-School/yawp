import {
  type DocumentCommentResponse,
  type DocumentComment,
  type User,
  Profile,
} from '@app/prisma';
import { useFetcher } from 'react-router';
import { useEffect, useRef, type MouseEvent } from 'react';
import { useCommentsSelection } from '../comments/selection-context';
import { CheckIcon, TrashIcon } from '~/components/icons';
import { RichTextarea } from '~/components/rich-textarea.js';
import { Button } from '~/components/ui/button';
import { UserImage } from '~/components/user-image';
import { useUser } from '~/hooks/useUser';
import { useDoubleCheck } from '~/utils/misc';
import { timeAgo } from '~/utils/timeAgo';

export type Comment = DocumentComment & {
  profile: Omit<Profile, 'createdAt' | 'updatedAt'>;
  responses: (DocumentCommentResponse & {
    profile: Omit<Profile, 'createdAt' | 'updatedAt'> & { user: User };
  })[];
};

type CommentProps = Comment & {
  readOnly?: boolean;
  onDelete?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
};

export const Comment = ({
  readOnly = false,
  onDelete,
  onResponseAdded,
  ...comment
}: CommentProps) => {
  const {
    activeCommentId,
    setActiveCommentId,
    hoveredCommentId,
    setHoveredCommentId,
  } = useCommentsSelection();
  const isFocused =
    activeCommentId === comment.id || hoveredCommentId === comment.id;
  const deleteCommentFetcher = useFetcher();
  const createCommentResponseFetcher = useFetcher();
  const dc = useDoubleCheck();
  const user = useUser();
  const ref = useRef(null);
  const lastHandledResponseRef = useRef<unknown>(null);

  useEffect(() => {
    const data = createCommentResponseFetcher.data as
      | { id?: string }
      | undefined;
    if (
      createCommentResponseFetcher.state === 'idle' &&
      data?.id &&
      data !== lastHandledResponseRef.current
    ) {
      lastHandledResponseRef.current = data;
      onResponseAdded?.(comment.id, data);
    }
  }, [
    createCommentResponseFetcher.state,
    createCommentResponseFetcher.data,
    comment.id,
    onResponseAdded,
  ]);

  const isTeacherOfCommentUser =
    user.selectedProfile?.teacherProfile?.profileId === comment.profileId;

  const optimisticData = createCommentResponseFetcher.formData;
  const optimisticDocumentCommentResponse = optimisticData
    ? [
        {
          id: 'unknown',
          createdAt: new Date(),
          content: optimisticData.get('content') as string,
          commentId: comment.id,
          profileId: user.selectedProfile!.id,
          profile: user.selectedProfile as any,
        },
      ]
    : [];

  const reply = (content: string) =>
    createCommentResponseFetcher.submit(
      { commentId: comment.id, content },
      { method: 'POST', action: '/api/model/document-comment-response' }
    );

  const deleteComment = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    deleteCommentFetcher.submit(null, {
      method: 'DELETE',
      action: `/api/model/document-comment/${comment.id}`,
    });

    onDelete?.(comment.id);

    const marks = document.querySelectorAll(
      `[data-comment-id="${comment.id}"]`
    );
    marks.forEach((mark) => {
      const node = mark as HTMLElement;
      if (node?.parentNode) {
        while (node.childNodes.length > 0) {
          node.parentNode.insertBefore(node.childNodes[0], node);
        }
        try {
          node.parentNode.removeChild(node);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(error);
        }
      }
    });
  };

  return (
    <div
      className={
        `relative flex flex-col rounded-lg p-3 transition-all duration-200 ease-in-out ` +
        (isFocused ? 'bg-ring/20 shadow-lg' : 'bg-stone-200')
      }
      id={`comment-${comment.id}`}
      data-comment-card={comment.id}
      onMouseEnter={() => setHoveredCommentId(comment.id)}
      onMouseLeave={() => setHoveredCommentId(null)}
      onClick={(e) => {
        e.stopPropagation();
        setActiveCommentId(comment.id);
      }}
      ref={ref}
    >
      <div className="flex items-center gap-1">
        <p className="w-full border-l-2 border-muted-foreground/50 pl-2 text-sm italic">
          {comment.content.length > 90
            ? comment.content.slice(0, 90) + '...'
            : comment.content}
        </p>
        {!readOnly &&
        (comment.profileId === user.selectedProfile?.id ||
          isTeacherOfCommentUser) ? (
          <Button
            {...dc.getButtonProps({
              onClick: (event) => {
                event.stopPropagation();
                if (dc.doubleCheck) {
                  deleteComment(event);
                }
              },
            })}
            type="submit"
            size="icon-sm"
            variant={dc.doubleCheck ? 'destructive' : 'ghost'}
          >
            {dc.doubleCheck ? <CheckIcon /> : <TrashIcon />}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {comment.responses
          .concat(optimisticDocumentCommentResponse)
          .map((response) => (
            <div key={response.id}>
              <div className="mt-1 flex items-center gap-2">
                <div>
                  <p className="text-xs font-semibold">
                    {response.profile?.user?.name ?? 'Unknown user'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(new Date(response.createdAt))}
                  </p>
                </div>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">
                {response.content}
              </p>
            </div>
          ))}
        {!readOnly ? (
          <RichTextarea
            placeholder="Reply..."
            name="content"
            size="sm"
            onCmdEnter={reply}
            textareaTestId={`comment-reply-input-${comment.id}`}
            sendButtonTestId={`comment-reply-send-${comment.id}`}
            className="mt-2 bg-muted"
          />
        ) : null}
      </div>
    </div>
  );
};
