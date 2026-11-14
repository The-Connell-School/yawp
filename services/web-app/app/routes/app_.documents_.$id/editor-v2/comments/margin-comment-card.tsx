import { Check, EllipsisVertical } from 'lucide-react';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { TrashIcon } from '~/components/icons';
import { RichTextarea } from '~/components/rich-textarea.js';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useUser } from '~/hooks/useUser';
import { cn } from '~/utils/misc';
import { timeAgo } from '~/utils/timeAgo';
import { buildSafeErrorScalarsForLog } from '~/utils/error-log-scalars';
import { useEditorChrome } from '../document-editor/editor-chrome-context';
import {
  initialsForDisplayName,
  readCommentHighlightExcerpt,
} from './comment-highlight-excerpt';
import { useCommentsSelection } from './selection-context';
import type { Comment as CommentType } from './comment';

type Props = CommentType & {
  readOnly?: boolean;
  onDelete?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
  onArchiveChange?: (commentId: string, archivedAt: Date | null) => void;
  autoFocusReply?: boolean;
};

export function MarginCommentCard({
  readOnly = false,
  onDelete,
  onResponseAdded,
  onArchiveChange,
  autoFocusReply = false,
  ...comment
}: Props) {
  const {
    activeCommentId,
    setActiveCommentId,
    hoveredCommentId,
    setHoveredCommentId,
  } = useCommentsSelection();
  const { contentRoot } = useEditorChrome();
  const isFocused =
    activeCommentId === comment.id || hoveredCommentId === comment.id;
  const user = useUser();
  const createCommentResponseFetcher = useFetcher();
  const deleteCommentFetcher = useFetcher();
  const archiveFetcher = useFetcher();
  const lastHandledResponseRef = useRef<unknown>(null);
  const [highlightExcerpt, setHighlightExcerpt] = useState<string | null>(null);
  const authorUser = (
    comment.membership as { user?: { name: string | null; email: string | null } }
  )?.user;
  const authorName = authorUser?.name ?? authorUser?.email ?? 'Unknown user';
  const isAuthor = comment.membershipId === user.selectedMembership?.id;
  const canModerate =
    !readOnly &&
    (isAuthor ||
      user.selectedMembership?.role === 'TEACHER' ||
      user.isAdmin);

  useEffect(() => {
    const refresh = () => {
      setHighlightExcerpt(
        readCommentHighlightExcerpt(contentRoot, comment.id) ??
          comment.content
      );
    };
    refresh();
    const id = window.setInterval(refresh, 500);
    return () => window.clearInterval(id);
  }, [comment.content, comment.id, contentRoot]);

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

  useEffect(() => {
    const data = archiveFetcher.data as { archivedAt?: string | null } | undefined;
    if (archiveFetcher.state === 'idle' && data && 'archivedAt' in data) {
      onArchiveChange?.(
        comment.id,
        data.archivedAt ? new Date(data.archivedAt) : null
      );
    }
  }, [archiveFetcher.state, archiveFetcher.data, comment.id, onArchiveChange]);

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
          console.error(
            'document_comment_dom_cleanup_failed',
            buildSafeErrorScalarsForLog(error)
          );
        }
      }
    });
  };

  const resolveComment = () => {
    archiveFetcher.submit(
      { intent: 'resolve' },
      {
        method: 'PATCH',
        action: `/api/model/document-comment/${comment.id}`,
      }
    );
  };

  return (
    <div
      className={cn(
        'doc-editor-comment-card relative flex flex-col gap-2 transition-all duration-200 ease-in-out',
        isFocused ? 'ring-2 ring-[hsl(210_75%_49%)]' : ''
      )}
      id={`comment-${comment.id}`}
      data-comment-card={comment.id}
      data-testid={`margin-comment-card-${comment.id}`}
      onMouseEnter={() => setHoveredCommentId(comment.id)}
      onMouseLeave={() => setHoveredCommentId(null)}
      onClick={(e) => {
        e.stopPropagation();
        setActiveCommentId(comment.id);
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[hsl(210_50%_90%)] text-[11px] font-bold text-[hsl(210_50%_30%)]"
          aria-hidden
        >
          {initialsForDisplayName(authorName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-[13px] text-[#1b1b1b]">{authorName}</b>
          <span className="text-[11px] text-[hsl(50_2.4%_36%)]">
            {timeAgo(new Date(comment.createdAt))}
          </span>
        </span>
        {canModerate ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 rounded-full"
            aria-label="Resolve comment"
            data-testid={`comment-resolve-${comment.id}`}
            loading={archiveFetcher.state !== 'idle'}
            onClick={(event) => {
              event.stopPropagation();
              resolveComment();
            }}
          >
            <Check className="h-[15px] w-[15px]" aria-hidden />
          </Button>
        ) : null}
        {!readOnly && isAuthor ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="h-7 w-7 rounded-full"
                aria-label="More"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisVertical className="h-[15px] w-[15px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  deleteComment(e as unknown as MouseEvent<HTMLButtonElement>);
                }}
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {highlightExcerpt ? (
        <span className="border-l-2 border-[hsl(40_90%_55%)] pl-2 text-xs italic text-[hsl(50_2.4%_36%)]">
          {highlightExcerpt.length > 120
            ? `${highlightExcerpt.slice(0, 120)}…`
            : highlightExcerpt}
        </span>
      ) : null}
      <div className="flex flex-col gap-2">
        {comment.responses.map((response) => (
          <div key={response.id}>
            <p className="m-0 text-[13px] leading-[1.45] text-[#1b1b1b] whitespace-pre-line">
              {response.content}
            </p>
            {response.membership?.user?.name ? (
              <p className="mt-1 text-[11px] text-[hsl(50_2.4%_36%)]">
                {response.membership.user.name} ·{' '}
                {timeAgo(new Date(response.createdAt))}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {!readOnly ? (
        <RichTextarea
          placeholder="Reply…"
          name="content"
          size="sm"
          onCmdEnter={reply}
          textareaTestId={`comment-reply-input-${comment.id}`}
          sendButtonTestId={`comment-reply-send-${comment.id}`}
          className="doc-editor-comment-reply"
          autoFocus={autoFocusReply}
        />
      ) : null}
    </div>
  );
}