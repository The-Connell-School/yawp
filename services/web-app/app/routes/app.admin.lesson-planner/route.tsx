/**
 * What teachers think of the Lesson Planner, in one place.
 *
 * Thumbs up and down on its replies, the notes left with a thumbs down, and
 * how many lessons were actually taught — the signals that say whether the
 * planner's output is usable, rather than merely generated.
 */
import {
  data as dataResponse,
  Link,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { timeAgo } from '~/utils/timeAgo';

const RECENT_LIMIT = 100;
const EXCERPT_CHARS = 140;
const RATING_FILTERS = ['up', 'down'] as const;
type RatingFilter = (typeof RATING_FILTERS)[number];

/** A reply named the way a teacher would recognise it: its title, or its first line. */
export function replyExcerpt(content: string): string {
  const prose = content.replace(/```[\s\S]*?```/g, '').trim();
  const heading = prose.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1];
  const firstLine = prose.split('\n').find((line) => line.trim()) ?? '';
  const text = (heading ?? firstLine).replace(/[*_`]/g, '').trim();
  return text.length > EXCERPT_CHARS
    ? `${text.slice(0, EXCERPT_CHARS - 1)}…`
    : text;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const param = new URL(request.url).searchParams.get('rating');
  const filter = (RATING_FILTERS as readonly string[]).includes(param ?? '')
    ? (param as RatingFilter)
    : null;

  const [up, down, taught, lessons, recent] = await Promise.all([
    prisma.lessonPlanMessage.count({ where: { rating: 'up' } }),
    prisma.lessonPlanMessage.count({ where: { rating: 'down' } }),
    prisma.lessonPlanConversation.count({
      where: { taughtAt: { not: null }, deletedAt: null },
    }),
    prisma.lessonPlanConversation.count({ where: { deletedAt: null } }),
    prisma.lessonPlanMessage.findMany({
      where: filter
        ? { rating: filter, ratedAt: { not: null } }
        : { ratedAt: { not: null } },
      orderBy: { ratedAt: 'desc' },
      take: RECENT_LIMIT,
      select: {
        id: true,
        rating: true,
        ratingNote: true,
        ratedAt: true,
        content: true,
        conversation: {
          select: {
            id: true,
            title: true,
            taughtAt: true,
            organization: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return dataResponse({
    filter,
    totals: { up, down, taught, lessons },
    recent: recent.map((message) => ({
      id: message.id,
      rating: message.rating,
      note: message.ratingNote,
      ratedAt: message.ratedAt?.toISOString() ?? null,
      reply: replyExcerpt(message.content),
      lesson: message.conversation.title,
      organization: message.conversation.organization.name,
      taught: Boolean(message.conversation.taughtAt),
    })),
  });
}

export default function AdminLessonPlannerRoute() {
  const { filter, totals, recent } = useLoaderData<typeof loader>();
  const rated = totals.up + totals.down;

  return (
    <div className="flex flex-col gap-6 p-3 md:p-5">
      <section
        data-testid="lesson-planner-feedback-totals"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <Stat label="Helpful" value={totals.up} />
        <Stat label="Not helpful" value={totals.down} />
        <Stat
          label="Share helpful"
          value={rated ? `${Math.round((totals.up / rated) * 100)}%` : '—'}
        />
        <Stat
          label="Lessons taught"
          value={`${totals.taught} of ${totals.lessons}`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <h2 className="mr-3 text-base font-semibold">Recent verdicts</h2>
          {(
            [
              [null, 'All'],
              ['down', 'Not helpful'],
              ['up', 'Helpful'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={label}
              size="sm"
              variant={filter === value ? 'secondary' : 'ghost'}
              asChild
            >
              <Link
                to={
                  value
                    ? `/app/admin/lesson-planner?rating=${value}`
                    : '/app/admin/lesson-planner'
                }
              >
                {label}
              </Link>
            </Button>
          ))}
        </div>

        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teacher has rated a reply yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {recent.map((entry) => (
              <li key={entry.id} className="flex gap-3 px-3 py-2.5 text-sm">
                <span
                  className={
                    entry.rating === 'up'
                      ? 'mt-0.5 text-emerald-600'
                      : 'mt-0.5 text-rose-600'
                  }
                  aria-label={entry.rating === 'up' ? 'Helpful' : 'Not helpful'}
                >
                  {entry.rating === 'up' ? (
                    <ThumbsUp size={15} />
                  ) : (
                    <ThumbsDown size={15} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {entry.reply || 'Untitled reply'}
                  </p>
                  {entry.note ? (
                    <p className="mt-0.5 whitespace-pre-wrap">{entry.note}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      entry.organization,
                      entry.lesson,
                      entry.taught ? 'taught' : null,
                      entry.ratedAt ? timeAgo(entry.ratedAt) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
