import { Link } from 'react-router';
import { Play } from 'lucide-react';
import { LoungeAvatar } from '~/components/lounge/lounge-avatar';
import type { LoungePinnedPost, LoungeTeamMember } from '~/domain/lounge/lounge.server';
import { formatVideoDuration } from '~/domain/lounge/video';
import { cn } from '~/utils/misc';

function replies(count: number) {
  return `${count} ${count === 1 ? 'reply' : 'replies'}`;
}

/**
 * The top of the feed: the oldest pinned post as a letter (Brian's
 * welcome), the next as a dark panel (the House Rules), any others as
 * small cards, and the faces of the YAWP! team. Each card is one link on
 * its title, stretched over the whole card.
 */
export function LoungeFeatured({ pinned, team }: { pinned: LoungePinnedPost[]; team: LoungeTeamMember[] }) {
  if (pinned.length === 0 && team.length === 0) return null;
  const [letter, panel, ...rest] = pinned;
  const hasSide = Boolean(panel) || rest.length > 0 || team.length > 0;

  return (
    <section aria-label="Pinned" className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-6">
      {letter ? (
        <article
          className={cn(
            'relative flex flex-col gap-4 rounded-2xl border bg-popover p-6 sm:p-8',
            hasSide ? 'md:col-span-8' : 'md:col-span-12'
          )}
        >
          <div className="flex items-center gap-3">
            <LoungeAvatar avatar={letter.avatar} />
            <div className="flex flex-col">
              <span className="font-medium">{letter.author.name}</span>
              <span className="text-sm text-muted-foreground">
                {letter.author.detail ? `${letter.author.detail} · ` : ''}pinned
              </span>
            </div>
          </div>
          <h2 className="lounge-serif text-[32px] leading-[1.1] text-foreground">
            <Link
              to={`/app/lounge/${letter.id}`}
              className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline"
            >
              {letter.title}
            </Link>
          </h2>
          {letter.excerpt ? (
            <p className="line-clamp-5 text-base leading-relaxed text-foreground/80">{letter.excerpt}</p>
          ) : null}
          <p className="lounge-accent mt-auto flex flex-wrap items-center gap-x-3 text-sm font-medium">
            {letter.hasVideo ? <VideoMark seconds={letter.videoDurationSeconds} /> : null}
            <span>Read and reply · {replies(letter.replyCount)}</span>
          </p>
        </article>
      ) : null}

      {hasSide ? (
        <div className={cn('flex flex-col gap-4', letter ? 'md:col-span-4' : 'md:col-span-12')}>
          {panel ? (
            <article className="relative flex flex-1 flex-col gap-2 rounded-2xl bg-foreground p-6 text-background">
              <span className="text-xs font-medium uppercase tracking-[0.08em] opacity-75">Pinned</span>
              <h2 className="lounge-serif text-2xl leading-tight text-background">
                <Link
                  to={`/app/lounge/${panel.id}`}
                  className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline"
                >
                  {panel.title}
                </Link>
              </h2>
              {panel.excerpt ? <p className="line-clamp-3 text-sm leading-relaxed opacity-85">{panel.excerpt}</p> : null}
              <span className="mt-auto pt-2 text-sm opacity-75">
                {panel.hasVideo ? <VideoMark seconds={panel.videoDurationSeconds} /> : null} {replies(panel.replyCount)}
              </span>
            </article>
          ) : null}

          {rest.map((post) => (
            <article key={post.id} className="relative flex flex-col gap-1 rounded-2xl border bg-popover px-5 py-4">
              <h2 className="lounge-serif text-xl leading-snug text-foreground">
                <Link
                  to={`/app/lounge/${post.id}`}
                  className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline"
                >
                  {post.title}
                </Link>
              </h2>
              <span className="text-sm text-muted-foreground">
                {post.authorIsStaff ? `From ${post.authorFirstName}` : 'Pinned'} · {replies(post.replyCount)}
                {post.hasVideo ? ' · video' : ''}
              </span>
            </article>
          ))}

          {team.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl border bg-popover px-5 py-4">
              <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">The YAWP! team</h2>
              <div className="flex items-center">
                {team.map((member, index) => (
                  <LoungeAvatar
                    key={member.userId}
                    avatar={member.avatar}
                    size="md"
                    className={cn('ring-2 ring-popover', index > 0 && '-ml-2')}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {team.map((member) => member.name.split(/\s+/)[0]).join(', ')}. Type @ in a post to ask one of us.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function VideoMark({ seconds }: { seconds: number | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Play size={12} fill="currentColor" aria-hidden="true" />
      Video{seconds ? ` · ${formatVideoDuration(seconds)}` : ''}
    </span>
  );
}
