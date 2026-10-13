import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  Link,
  useLoaderData,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { HelpfulButton } from '~/components/lounge/helpful-button';
import { LoungeByline } from '~/components/lounge/lounge-byline';
import { LoungeHeader } from '~/components/lounge/lounge-header';
import { requireLoungeAccess } from '~/domain/lounge/access.server';
import {
  LoungeNotFoundError,
  listLoungePosts,
  toggleLoungeVote,
  type LoungeSort,
} from '~/domain/lounge/lounge.server';
import { formatLoungeTime } from '~/domain/lounge/time';
import { isLoungeTopic, loungeTopicLabel } from '~/domain/lounge/topics';
import { cn } from '~/utils/misc';

const SORTS: Array<{ key: LoungeSort; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'top', label: 'Top' },
  { key: 'unanswered', label: 'Unanswered' },
];

const KIND_LABEL = { QUESTION: 'Question', SHARE: 'Share', WIN: 'Win' } as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const { viewer } = await requireLoungeAccess(request);
  const url = new URL(request.url);
  const sortParam = url.searchParams.get('sort');
  const sort: LoungeSort = sortParam === 'top' || sortParam === 'unanswered' ? sortParam : 'new';
  const topicParam = url.searchParams.get('topic');
  const topic = isLoungeTopic(topicParam) ? topicParam : null;
  const before = url.searchParams.get('before');
  const now = new Date();
  const { posts, nextCursor } = await listLoungePosts(viewer, { sort, topic, before, now });
  return data({
    sort,
    topic,
    topicLabel: topic ? loungeTopicLabel(topic) : null,
    nextCursor,
    posts: posts.map((post) => ({ ...post, when: formatLoungeTime(post.createdAt, now) })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { viewer } = await requireLoungeAccess(request);
  const form = await request.formData();
  if (form.get('intent') !== 'vote') return data({ ok: false }, { status: 400 });
  const postId = String(form.get('postId') ?? '');
  try {
    return data({ ok: true, ...(await toggleLoungeVote(viewer, { postId })) });
  } catch (error) {
    if (error instanceof LoungeNotFoundError) return data({ ok: false }, { status: 404 });
    throw error;
  }
}

function feedHref(params: { sort: LoungeSort; topic: string | null; before?: string | null }) {
  const search = new URLSearchParams();
  if (params.sort !== 'new') search.set('sort', params.sort);
  if (params.topic) search.set('topic', params.topic);
  if (params.before) search.set('before', params.before);
  const query = search.toString();
  return query ? `/app/lounge?${query}` : '/app/lounge';
}

export default function LoungeFeedRoute() {
  const { posts, sort, topic, topicLabel, nextCursor } = useLoaderData<typeof loader>();

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <LoungeHeader
        active="community"
        description="Ask the teachers using Yawp how they teach it. Share what worked. Brian and the Yawp team read every question."
        action={
          <Link
            to="/app/lounge/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            New post
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-screen-md px-3 py-6 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b">
          <nav aria-label="Sort posts" className="flex gap-5">
            {SORTS.map((option) => (
              <Link
                key={option.key}
                to={feedHref({ sort: option.key, topic })}
                aria-current={sort === option.key ? 'page' : undefined}
                className={cn(
                  '-mb-px border-b-2 py-2 text-sm',
                  sort === option.key
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          {topicLabel ? (
            <p className="text-sm text-muted-foreground">
              Showing {topicLabel} ·{' '}
              <Link to={feedHref({ sort, topic: null })} className="underline">
                Show all
              </Link>
            </p>
          ) : null}
        </div>

        {posts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-medium">
              {sort === 'unanswered' ? 'Every question has a reply.' : 'No posts yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sort === 'unanswered'
                ? 'Nice work, everyone.'
                : 'Ask the first question or share something that worked.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {posts.map((post) => (
              <li key={post.id}>
                <article className="flex flex-col gap-1.5 border-b py-5">
                  <Link
                    to={`/app/lounge/${post.id}`}
                    className="text-lg font-medium leading-snug hover:text-primary"
                  >
                    {post.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <LoungeByline byline={post.author} when={post.when} />
                    <span>{KIND_LABEL[post.kind]}</span>
                    <Link to={feedHref({ sort, topic: post.topic })} className="hover:underline">
                      {post.topicLabel}
                    </Link>
                    {post.isPrivate ? <span>Private to the Yawp team</span> : null}
                    {post.staffAnswered ? (
                      <span className="font-medium text-primary">Yawp team answered</span>
                    ) : null}
                    <span className="ml-auto inline-flex items-center gap-4">
                      <span>
                        {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
                      </span>
                      <HelpfulButton
                        count={post.helpfulCount}
                        voted={post.viewerVoted}
                        isOwn={post.isOwn}
                        postId={post.id}
                      />
                    </span>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}

        {nextCursor ? (
          <div className="py-6 text-center">
            <Link to={feedHref({ sort, topic, before: nextCursor })} className="text-sm underline">
              Older posts
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
