import { Video } from 'lucide-react';
import { formatVideoDuration } from '~/domain/lounge/video';

/**
 * A Yawp team video, played inline with the browser's own controls (keyboard
 * and screen-reader friendly). `url` is signed per page load; null means
 * signing failed, so say so rather than show a broken player.
 */
export function LoungeVideoPlayer({
  url,
  title,
  durationSeconds,
  label,
}: {
  url: string | null;
  title: string | null;
  durationSeconds: number | null;
  label: string;
}) {
  const duration = formatVideoDuration(durationSeconds);
  return (
    <figure className="m-0 flex max-w-xl flex-col gap-2">
      <figcaption className="flex items-center gap-2 text-sm text-muted-foreground">
        <Video size={16} aria-hidden="true" className="text-primary" />
        <span>
          {title ? <span className="font-medium text-foreground">{title}</span> : label}
          {duration ? <> · {duration}</> : null}
        </span>
      </figcaption>
      {url ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={title ? `${label}: ${title}` : label}
          className="aspect-video w-full rounded-lg bg-[#2A2824]"
        />
      ) : (
        <p className="rounded-lg bg-secondary px-4 py-6 text-sm text-muted-foreground">
          This video isn&apos;t available right now.
        </p>
      )}
    </figure>
  );
}
