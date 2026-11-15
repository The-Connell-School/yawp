import { Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '~/utils/misc';
import { MarginCommentCard } from './margin-comment-card';
import type { Comment as CommentType } from './comment';

type Props = CommentType & {
  readOnly?: boolean;
  onDelete?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
  onArchiveChange?: (commentId: string, archivedAt: Date | null) => void;
};

export function MarginCommentResolvedRow(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const authorUser = (
    props.membership as { user?: { name: string | null; email: string | null } }
  )?.user;
  const authorName =
    authorUser?.name ?? authorUser?.email ?? 'Someone';

  if (expanded) {
    return (
      <div data-testid={`margin-comment-resolved-${props.id}`}>
        <MarginCommentCard {...props} />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        'doc-editor-comment-resolved-row',
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px]'
      )}
      data-testid={`margin-comment-resolved-${props.id}`}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded(true);
      }}
    >
      <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(142_50%_35%)]" aria-hidden />
      <span className="text-[hsl(50_2.4%_36%)]">Resolved</span>
      <span className="text-[hsl(50_2.4%_36%)]">·</span>
      <span className="min-w-0 flex-1 truncate font-medium text-[#1b1b1b]">
        {authorName}
      </span>
      <span className="shrink-0 font-semibold text-[hsl(210_50%_30%)]">Show</span>
    </button>
  );
}