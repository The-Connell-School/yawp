import { Link } from 'react-router';
import { Check, FileText, Video } from 'lucide-react';
import { HelpfulButton } from '~/components/lounge/helpful-button';
import { LoungeAvatar } from '~/components/lounge/lounge-avatar';
import { LoungeTagList } from '~/components/lounge/lounge-tags';
import { LOUNGE_TEAM_NAME } from '~/domain/lounge/launch';
import type { LoungePostSummary } from '~/domain/lounge/lounge.server';

const KIND_PILL = {
  WIN: { label: 'Win', className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  SHARE: { label: 'Share', className: 'lounge-accent-soft lounge-accent' },
} as const;

/**
 * One post in the feed, as its own card on the Lounge's cream page: avatar,
 * a serif title, one preview line (the YAWP! team's answer when there is
 * one), the post's tags, and a quiet meta line. Questions carry no pill;
 * Shares and Wins do (a post can be both a question and a share).
 *
 * The whole card opens the post (the title's link is stretched over it) and
 * lifts a little on hover; the tags and Helpful sit above that link.
 */
export function LoungePostRow({
  post,
  when,
  topicHref,
}: {
  post: LoungePostSummary;
  when: string;
  topicHref: (topic: string) => string;
}) {
  const answeredBy = post.answeredBy ?? LOUNGE_TEAM_NAME;
  const pills = post.tags.kinds.flatMap((kind) => (kind === 'QUESTION' ? [] : [KIND_PILL[kind]]));
  return (
    <article className="relative flex gap-4 rounded-2xl border bg-popover p-5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_6px_16px_-6px_hsl(var(--foreground)/0.18)] focus-within:border-foreground/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:gap-5 sm:p-6">
      <LoungeAvatar avatar={post.avatar} className="hidden sm:inline-flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Link
          to={`/app/lounge/${post.id}`}
          className="lounge-serif text-[25px] leading-[1.15] after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline"
        >
          {post.title}
        </Link>
        {post.attachment ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <FileText size={16} aria-hidden="true" className="lounge-accent shrink-0" />
            <span>
              {post.attachment.typeTitle} · {post.attachment.title}
              <span className="text-muted-foreground">
                {' '}
                · used by {post.attachment.useCount} {post.attachment.useCount === 1 ? 'teacher' : 'teachers'}
              </span>
            </span>
          </span>
        ) : post.preview ? (
          <p className="line-clamp-2 text-[15px] leading-relaxed text-foreground/80">{post.preview}</p>
        ) : null}
        <LoungeTagList tags={post.tags} topicHref={topicHref} />
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
          <LoungeAvatar avatar={post.avatar} size="sm" className="sm:hidden" />
          <span className="font-medium text-foreground">{post.author.name}</span>
          {post.author.detail ? <span>{post.author.detail}</span> : null}
          <span aria-hidden="true">·</span>
          <span>{when}</span>
          {pills.map((pill) => (
            <span key={pill.label} className={`rounded-md px-2 py-0.5 text-[13px] font-medium ${pill.className}`}>
              {pill.label}
            </span>
          ))}
          {post.isEdited ? <span>edited</span> : null}
          {post.isPrivate ? <span>Private to the {LOUNGE_TEAM_NAME}</span> : null}
          {post.staffAnsweredOnVideo ? (
            <span className="lounge-accent inline-flex items-center gap-1 font-medium">
              <Video size={14} aria-hidden="true" />
              {answeredBy} answered on video
            </span>
          ) : post.staffAnswered ? (
            <span className="lounge-accent inline-flex items-center gap-1 font-medium">
              <Check size={14} strokeWidth={2.5} aria-hidden="true" />
              {answeredBy} answered
            </span>
          ) : null}
          <span className="relative z-10 ml-auto inline-flex items-center gap-4">
            <span>
              {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
            </span>
            <HelpfulButton count={post.helpfulCount} voted={post.viewerVoted} isOwn={post.isOwn} postId={post.id} />
          </span>
        </div>
      </div>
    </article>
  );
}
