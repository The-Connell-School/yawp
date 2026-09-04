import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import type { DraftComment } from './comments';

/**
 * The comment thread on a shared draft, for both sides of it.
 *
 * The teacher writes comments; the group replies. Same list, same shapes, so a
 * student and their teacher are looking at the same conversation rather than two
 * views that could drift.
 *
 * `canComment` and `canReply` are separate because the rule is asymmetric:
 * teachers comment and never write in the draft, students reply and never
 * comment on their own work.
 */

const when = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function DraftCommentThread({
  comments,
  canComment,
  canReply,
  action,
}: {
  comments: DraftComment[];
  canComment: boolean;
  canReply: boolean;
  /** Where the forms post. Each page owns its own route. */
  action?: string;
}) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const busy = fetcher.state !== 'idle';
  const error =
    fetcher.data && fetcher.data.success === false ? fetcher.data.message : '';

  return (
    <section aria-labelledby="draft-comments" className="rounded-lg border">
      <h2 id="draft-comments" className="border-b px-4 py-2 text-sm font-semibold">
        Comments
      </h2>

      {error ? (
        <p className="border-b bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {comments.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {canComment
            ? 'No comments yet. Anything you write here is visible to everyone in the group.'
            : 'No comments from your teacher yet.'}
        </p>
      ) : (
        <ul className="divide-y">
          {comments.map((comment) => (
            <li key={comment.id} className="px-4 py-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {comment.authorName}
                </span>
                {comment.authorRole === 'TEACHER' ? ' · teacher' : ''} ·{' '}
                {when.format(new Date(comment.createdAt))}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>

              {comment.responses.length > 0 ? (
                <ul className="mt-2 grid gap-2 border-l pl-3">
                  {comment.responses.map((response) => (
                    <li key={response.id}>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {response.authorName}
                        </span>{' '}
                        · {when.format(new Date(response.createdAt))}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">
                        {response.content}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}

              {canReply ? (
                <fetcher.Form
                  method="post"
                  action={action}
                  className="mt-2 flex items-start gap-2"
                >
                  <input type="hidden" name="intent" value="reply-comment" />
                  <input type="hidden" name="commentId" value={comment.id} />
                  <textarea
                    name="content"
                    rows={1}
                    required
                    placeholder="Reply…"
                    className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={busy}>
                    Reply
                  </Button>
                </fetcher.Form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <fetcher.Form
          method="post"
          action={action}
          className="grid gap-2 border-t px-4 py-3"
        >
          <input type="hidden" name="intent" value="add-comment" />
          <label className="grid gap-1 text-sm">
            Comment on this draft
            <textarea
              name="content"
              rows={3}
              required
              placeholder="What should this group do next?"
              className="rounded border px-2 py-1"
            />
          </label>
          <Button type="submit" size="sm" disabled={busy} className="justify-self-start">
            Post comment
          </Button>
        </fetcher.Form>
      ) : null}
    </section>
  );
}
