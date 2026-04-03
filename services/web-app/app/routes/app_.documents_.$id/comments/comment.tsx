import {
  type DocumentCommentResponse,
  type DocumentComment,
  type User,
  Profile,
} from '@app/prisma';
import { useFetcher } from 'react-router';
import { useRef, useState, type MouseEvent } from 'react';
import { useCommentsSelection } from '../comments/selection-context';
import { CheckIcon, TrashIcon } from '~/components/icons';
import { RichTextarea } from '~/components/rich-textarea.js';
import { Button } from '~/components/ui/button';
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
  onResponseCreated?: (commentId: string, response: any) => void;
};

export const Comment = ({ readOnly = false, onResponseCreated, ...comment }: CommentProps) => {
  const {
    activeCommentId,
    setActiveCommentId,
    hoveredCommentId,
    setHoveredCommentId,
  } = useCommentsSelection();
  const deleteCommentFetcher = useFetcher();
  const dc = useDoubleCheck();
  const user = useUser();
  const ref = useRef(null);
  const [optimisticResponses, setOptimisticResponses] = useState<any[]>([]);

  const isTeacherOfCommentUser =
    user.selectedProfile?.teacherProfile?.profileId === comment.profileId;

  const reply = async (content: string) => {
    const optimistic = {
      id: `optimistic-${Date.now()}`,
      createdAt: new Date(),
      content,
      commentId: comment.id,
      profileId: user.selectedProfile!.id,
      profile: user.selectedProfile as any,
    };
    setOptimisticResponses((prev) => [...prev, optimistic]);
    try {
      const formData = new FormData();
      formData.append('commentId', comment.id);
      formData.append('content', content);
      const res = await fetch('/api/model/document-comment-response', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const created = await res.json();
        setOptimisticResponses((prev) =>
          prev.filter((r) => r.id !== optimistic.id)
        );
        onResponseCreated?.(comment.id, {
          ...created,
          profile: user.selectedProfile as any,
        });
      } else {
        setOptimisticResponses((prev) =>
          prev.filter((r) => r.id !== optimistic.id)
        );
      }
    } catch {
      setOptimisticResponses((prev) =>
        prev.filter((r) => r.id !== optimistic.id)
      );
    }
  };

  const deleteComment = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    deleteCommentFetcher.submit(null, {
      method: 'DELETE',
      action: `/api/model/document-comment/${comment.id}`,
    });

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
        (activeCommentId === comment.id || hoveredCommentId === comment.id
          ? 'bg-ring/20 shadow-lg'
          : 'bg-stone-200')
      }
      id={`comment-${comment.id}`}
      onMouseEnter={() => {
        setHoveredCommentId(comment.id);
        const commentNode = document.getElementById(`comment-${comment.id}`);
        if (commentNode) {
          commentNode.classList.add('bg-ring/20', 'shadow-lg');
          commentNode.classList.remove('bg-stone-200');
        }
        const marks = document.querySelectorAll<HTMLElement>(
          `[data-comment-id="${comment.id}"]`
        );
        marks.forEach((m) => m.classList.add('focused'));
      }}
      onMouseLeave={() => {
        setHoveredCommentId(null);
        const commentNode = document.getElementById(`comment-${comment.id}`);
        if (
          commentNode &&
          commentNode.getAttribute('data-comment-active') !== 'true'
        ) {
          commentNode.classList.remove('bg-ring/20', 'shadow-lg');
          commentNode.classList.add('bg-stone-200');
          const marks = document.querySelectorAll<HTMLElement>(
            `[data-comment-id="${comment.id}"]`
          );
          marks.forEach((m) => m.classList.remove('focused'));
        }
      }}
      onClick={() => {
        setActiveCommentId(comment.id);
        const prevActive = document.querySelector(
          '[data-comment-active="true"]'
        ) as HTMLElement | null;
        if (prevActive) {
          prevActive.classList.remove('bg-ring/20', 'shadow-lg');
          prevActive.classList.add('bg-stone-200');
          prevActive.removeAttribute('data-comment-active');
        }
        document
          .querySelectorAll<HTMLElement>('.comment-mark.focused')
          .forEach((el) => el.classList.remove('focused'));

        const commentNode = document.getElementById(`comment-${comment.id}`);
        if (commentNode) {
          commentNode.classList.add('bg-ring/20', 'shadow-lg');
          commentNode.classList.remove('bg-stone-200');
          commentNode.setAttribute('data-comment-active', 'true');
        }
        const marks = document.querySelectorAll<HTMLElement>(
          `[data-comment-id="${comment.id}"]`
        );
        marks.forEach((m) => m.classList.add('focused'));
        const first = marks.item(0);
        if (first) {
          first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
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
          .concat(optimisticResponses)
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
