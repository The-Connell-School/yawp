import { Link } from 'react-router';
import { loungeTagLabels, type LoungePostTags } from '~/domain/lounge/tags';
import { cn } from '~/utils/misc';

/**
 * A post's subjects and topics as small sentence-case chips. Each topic
 * links to the feed filtered to it. The post type is not repeated here: the
 * feed marks Shares and Wins on its own line, and a thread needs no label.
 */
export function LoungeTagList({
  tags,
  topicHref,
  className,
}: {
  tags: LoungePostTags;
  topicHref: (topic: string) => string;
  className?: string;
}) {
  const labels = loungeTagLabels(tags);
  if (labels.length === 0) return null;
  return (
    <ul aria-label="Tags" className={cn('relative z-10 flex flex-wrap gap-1.5', className)}>
      {labels.map((tag) => (
        <li key={tag.key} className="inline-flex">
          {tag.topic ? (
            <Link
              to={topicHref(tag.topic)}
              className="inline-flex min-h-7 items-center rounded-full bg-foreground/[0.06] px-2.5 text-[13px] text-foreground/80 hover:bg-foreground/10 hover:text-foreground"
            >
              {tag.label}
            </Link>
          ) : (
            <span className="inline-flex min-h-7 items-center rounded-full border px-2.5 text-[13px] text-foreground/80">
              {tag.label}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
