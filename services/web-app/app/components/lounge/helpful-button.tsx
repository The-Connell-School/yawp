import { ChevronUp } from 'lucide-react';
import { useFetcher } from 'react-router';
import { cn } from '~/utils/misc';

/**
 * "Helpful" vote. Posts to the current route's action with intent=vote and
 * shows the new state right away. On your own post or reply it is only a count.
 */
export function HelpfulButton({
  count,
  voted,
  isOwn,
  postId,
  replyId,
  action,
}: {
  count: number;
  voted: boolean;
  isOwn: boolean;
  postId?: string;
  replyId?: string;
  action?: string;
}) {
  const fetcher = useFetcher();
  const pending = fetcher.formData?.get('intent') === 'vote';
  const shownVoted = pending ? !voted : voted;
  const shownCount = count + (shownVoted === voted ? 0 : shownVoted ? 1 : -1);

  if (isOwn) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        {shownCount} helpful
      </span>
    );
  }

  return (
    <fetcher.Form method="post" action={action} className="inline">
      <input type="hidden" name="intent" value="vote" />
      {postId ? <input type="hidden" name="postId" value={postId} /> : null}
      {replyId ? <input type="hidden" name="replyId" value={replyId} /> : null}
      <button
        type="submit"
        aria-pressed={shownVoted}
        className={cn(
          'inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-sm',
          shownVoted ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <ChevronUp size={16} aria-hidden="true" />
        {shownCount} helpful
      </button>
    </fetcher.Form>
  );
}
