/**
 * A lesson's tutorial video, from How to Teach It (Brian, Nov 6), played on
 * the assignment type's own page, under the same access as the type's page.
 *
 * The video is Brian's own recording for the lesson (Nov 14), which comes
 * with the app (thesis-essay-course.ts): Body paragraphs has two, the
 * paragraphs and then supporting quotes. A lesson he has not recorded plays
 * its module from the Teachers' Lounge course instead; the Lounge's pages are
 * temporarily disabled for most teachers, so that video is served here too.
 */
import { Link, redirect, data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { assignmentTypeAvailableForTeacher } from '~/domain/assignment-types/available-for-teacher.server';
import { isAssignmentTypeHowToTeachLockedForTeacher } from '~/domain/free-tier/site-license-how-to-teach.server';
import { findThesisEssayCourse } from '~/domain/teacher-trainings/thesis-essay-course.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getTeacherTrainingPlaybackUrl } from '~/utils/teacher-training-video-link.server';
import { THESIS_ESSAY_COURSE } from '../app.assignment-types.$id/landing-copy/thesis-essay-course';

/** One video on the page. */
type TutorialVideo = {
  /** What it teaches. Shown above it when the lesson has more than one. */
  title: string;
  src: string;
  poster: string | null;
  /** WebVTT captions, where the video has them. */
  captions: string | null;
  minutes: number | null;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');

  const assignmentTypeId = params.id ?? '';
  const pagePath = `/app/assignment-types/${assignmentTypeId}`;
  const lessonNumber = Number(params.lesson);
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > THESIS_ESSAY_COURSE.length) {
    throw data({ error: 'No such lesson.' }, { status: 404 });
  }
  const available = await assignmentTypeAvailableForTeacher({
    assignmentTypeId,
    membershipId: profile.id,
    organizationId: profile.organization.id,
  });
  if (!available) throw redirect('/app');
  if (
    await isAssignmentTypeHowToTeachLockedForTeacher({
      organizationPlan: profile.organization.plan,
      assignmentTypeId,
    })
  ) {
    throw data({ error: 'Comes with a school site license.' }, { status: 403 });
  }

  const lesson = THESIS_ESSAY_COURSE[lessonNumber - 1]!;
  const page = { pagePath, lessonNumber, lessonTitle: lesson.title };

  if (lesson.tutorials.length > 0) {
    const videos: TutorialVideo[] = lesson.tutorials.map(({ title, src, poster, captions, minutes }) => ({
      title,
      src,
      poster,
      captions,
      minutes,
    }));
    return {
      ...page,
      moduleTitle: null as string | null,
      videos,
      minutes: lesson.tutorials.reduce((sum, tutorial) => sum + tutorial.minutes, 0) as number | null,
    };
  }

  const course = await findThesisEssayCourse(profile.id);
  const moduleId = course?.videoModules[lessonNumber];
  const module = moduleId
    ? await prisma.teacherTrainingModule.findFirst({
        where: { id: moduleId, teacherTrainingId: course!.courseId },
        select: { title: true, videoS3Key: true, videoDuration: true },
      })
    : null;
  if (!module) throw data({ error: 'This lesson has no tutorial video yet.' }, { status: 404 });

  const videoUrl = await getTeacherTrainingPlaybackUrl(module.videoS3Key);
  const minutes = module.videoDuration ? Math.max(1, Math.round(module.videoDuration / 60)) : null;
  const videos: TutorialVideo[] = videoUrl
    ? [{ title: lesson.title, src: videoUrl, poster: null, captions: null, minutes }]
    : [];
  return { ...page, moduleTitle: module.title as string | null, videos, minutes };
}

export default function LessonTutorialRoute() {
  const { pagePath, lessonNumber, lessonTitle, moduleTitle, videos, minutes } = useLoaderData<typeof loader>();
  return (
    <section className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-6">
        <div>
          <Button variant="outline" size="sm" asChild>
            <Link to={pagePath}>
              <ChevronLeft size={16} className="mr-1" />
              Back
            </Link>
          </Button>
        </div>
        <header className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            Lesson {lessonNumber} of The Thesis-Driven Essay course
            {minutes ? ` · about ${minutes} min` : ''}
          </p>
          <h1 className="text-2xl font-bold leading-tight md:text-3xl">{lessonTitle}</h1>
          {moduleTitle && moduleTitle.replace(/^lesson\s+\d+\s*[:—–-]\s*/i, '').trim().toLowerCase() !== lessonTitle.toLowerCase() ? (
            <p className="text-sm text-muted-foreground">{moduleTitle}</p>
          ) : null}
        </header>
        {videos.length === 0 ? (
          <p data-testid="tutorial-unavailable" className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">
            The video isn’t available right now. Try again in a minute.
          </p>
        ) : null}
        {videos.map((video) => (
          <figure key={video.src} data-testid="tutorial" className="flex flex-col gap-2">
            {videos.length > 1 ? (
              <figcaption className="text-lg font-semibold">
                {video.title}
                {video.minutes ? (
                  <span className="font-normal text-muted-foreground"> · about {video.minutes} min</span>
                ) : null}
              </figcaption>
            ) : null}
            <video
              data-testid="tutorial-video"
              className="aspect-video w-full rounded-xl border bg-black"
              controls
              playsInline
              preload="metadata"
              poster={video.poster ?? undefined}
              aria-label={`${video.title}: tutorial video`}
              src={video.src}
            >
              {video.captions ? (
                <track kind="captions" src={video.captions} srcLang="en" label="English" default />
              ) : null}
            </video>
          </figure>
        ))}
      </div>
    </section>
  );
}
