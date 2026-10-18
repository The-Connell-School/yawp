import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  Link,
  useLoaderData,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { LoungeFeatured } from '~/components/lounge/lounge-featured';
import { LoungeMasthead } from '~/components/lounge/lounge-masthead';
import { LoungePostRow } from '~/components/lounge/lounge-post-row';
import { requireLoungeMember } from '~/domain/lounge/access.server';
import {
  LoungeNotFoundError,
  listLoungePosts,
  listLoungeTopicCounts,
  listPinnedLoungePosts,
  getLoungeHost,
  toggleLoungeVote,
  type LoungeSort,
} from '~/domain/lounge/lounge.server';
import { formatLoungeTime } from '~/domain/lounge/time';
import { isLoungeTopic, loungeTopicLabel } from '~/domain/lounge/topics';
import { cn } from '~/utils/misc';

const SORTS: Array<{ key: LoungeSort; label: string }> = [
  { key: 'new', label: 'Latest' },
  { key: 'top', label: 'Most helpful' },
  { key: 'unanswered', label: 'Unanswered' },
];

const MAX_TOPIC_CHIPS = 6;

export async function loader({ request }: LoaderFunctionArgs) {
  const { viewer } = await requireLoungeMember(request);
  const url = new URL(request.url);
  const sortParam = url.searchParams.get('sort');
  const sort: LoungeSort = sortParam === 'top' || sortParam === 'unanswered' ? sortParam : 'new';
  const topicParam = url.searchParams.get('topic');
  const topic = isLoungeTopic(topicParam) ? topicParam : null;
  const before = url.searchParams.get('before');
  const now = new Date();
  // The letter, the House Rules panel, and the team sit on the unfiltered
  // first page only; anywhere else pinned posts are ordinary rows.
  const showFeatured = !before && !topic;
  const [{ posts, nextCursor }, pinned, host, topicCounts] = await Promise.all([
    listLoungePosts(viewer, { sort, topic, before, now }),
    showFeatured ? listPinnedLoungePosts(viewer, now) : Promise.resolve([]),
    showFeatured ? getLoungeHost() : Promise.resolve(null),
    before ? Promise.resolve([]) : listLoungeTopicCounts(viewer, now),
  ]);
  const pinnedIds = new Set(pinned.map((post) => post.id));
  const chips = topicCounts.slice(0, MAX_TOPIC_CHIPS);
  if (topic && !chips.some((chip) => chip.topic === topic)) {
    chips.push({ topic, label: loungeTopicLabel(topic), count: 0 });
  }
  return data({
    pinned,
    host,
    chips,
    sort,
    topic,
    nextCursor,
    posts: posts
      .filter((post) => !pinnedIds.has(post.id))
      .map((post) => ({ ...post, when: formatLoungeTime(post.createdAt, now) })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { viewer } = await requireLoungeMember(request);
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
  const { posts, sort, topic, chips, nextCursor, pinned, host } = useLoaderData<typeof loader>();

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <LoungeMasthead
        active="community"
        action={
          <Link
            to="/app/lounge/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            New post
          </Link>
        }
      />
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 pb-14 pt-7 sm:px-8">
        <LoungeFeatured pinned={pinned} host={host} />

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b">
          <nav aria-label="Sort posts" className="flex gap-6">
            {SORTS.map((option) => (
              <Link
                key={option.key}
                to={feedHref({ sort: option.key, topic })}
                aria-current={sort === option.key ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 text-[15px]',
                  sort === option.key
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          {chips.length > 0 ? (
            <nav aria-label="Topics" className="flex flex-wrap gap-2 pb-2 text-[13px]">
              <TopicChip to={feedHref({ sort, topic: null })} current={!topic}>
                All topics
              </TopicChip>
              {chips.map((chip) => (
                <TopicChip key={chip.topic} to={feedHref({ sort, topic: chip.topic })} current={topic === chip.topic}>
                  {chip.label}
                </TopicChip>
              ))}
            </nav>
          ) : null}
        </div>

        {posts.length === 0 ? (
          <div className="py-12 text-center">
            <p className="lounge-serif text-2xl text-foreground">
              {sort === 'unanswered' ? 'Every question has a reply.' : 'No posts yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sort === 'unanswered'
                ? 'Nice work, everyone.'
                : 'Ask the first question or share something that worked.'}
            </p>
          </div>
        ) : (
          <ul className="-mt-6 flex flex-col">
            {posts.map((post) => (
              <li key={post.id}>
                <LoungePostRow post={post} when={post.when} topicHref={feedHref({ sort, topic: post.topic })} />
              </li>
            ))}
          </ul>
        )}

        {nextCursor ? (
          <div className="text-center">
            <Link
              to={feedHref({ sort, topic, before: nextCursor })}
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              Older posts
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TopicChip({ to, current, children }: { to: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-3',
        current ? 'border-foreground bg-foreground text-background' : 'bg-popover hover:border-foreground/40'
      )}
    >
      {children}
    </Link>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
