import { Link } from 'react-router';
import type { AssignmentTrainingVideo } from '~/domain/teacher-trainings/assignment-videos.server';

/**
 * "How to teach this": a step's training video, on the assignment page
 * instead of in the Faculty Lounge's Trainings (Brian, round 6). Captions
 * come with it; the lesson in Trainings keeps the transcript and progress.
 */
export function AssignmentTrainingVideo({ video }: { video: AssignmentTrainingVideo }) {
  return (
    <figure className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-foreground">
      <figcaption className="text-sm font-medium">How to teach this: {video.title}</figcaption>
      {video.playbackUrl ? (
        <video controls preload="metadata" src={video.playbackUrl} className="aspect-video w-full rounded bg-black">
          {video.captionSrc ? <track kind="captions" src={video.captionSrc} srcLang="en" label="English captions" default /> : null}
        </video>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link to={video.href} className="underline underline-offset-4">
          {video.playbackUrl ? 'Open in Trainings' : 'Watch in Trainings'}
        </Link>
        {video.transcriptHref ? (
          <a href={video.transcriptHref} className="underline underline-offset-4">
            Transcript
          </a>
        ) : null}
      </div>
    </figure>
  );
}
