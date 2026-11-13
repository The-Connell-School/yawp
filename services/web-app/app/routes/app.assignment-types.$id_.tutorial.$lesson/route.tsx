/**
 * A lesson's tutorial video, from How to Teach It (Brian, Nov 6): the
 * Teachers' Lounge module for that lesson of The Thesis-Driven Essay course,
 * played on the assignment type's own page. The Lounge's pages are
 * temporarily disabled for most teachers, so the video is served here, under
 * the same access as the type's page.
 */
import { Link, redirect, data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { assignmentTypeAvailableForTeacher } from '~/domain/assignment-types/available-for-teacher.server';
import { findThesisEssayCourse } from '~/domain/teacher-trainings/thesis-essay-course.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getTeacherTrainingPlaybackUrl } from '~/utils/teacher-training-video-link.server';
import { THESIS_ESSAY_COURSE } from '../app.assignment-types.$id/landing-copy/thesis-essay-course';

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

  const course = await findThesisEssayCourse(profile.id);
  const moduleId = course?.videoModules[lessonNumber];
  const module = moduleId
    ? await prisma.teacherTrainingModule.findFirst({
        where: { id: moduleId, teacherTrainingId: course!.courseId },
        select: { title: true, videoS3Key: true, videoDuration: true },
      })
    : null;
  if (!module) throw data({ error: 'This lesson has no tutorial video yet.' }, { status: 404 });

  return {
    pagePath,
    lessonNumber,
    lessonTitle: THESIS_ESSAY_COURSE[lessonNumber - 1]!.title,
    moduleTitle: module.title,
    videoUrl: await getTeacherTrainingPlaybackUrl(module.videoS3Key),
    minutes: module.videoDuration ? Math.max(1, Math.round(module.videoDuration / 60)) : null,
  };
}

export default function LessonTutorialRoute() {
  const { pagePath, lessonNumber, lessonTitle, moduleTitle, videoUrl, minutes } = useLoaderData<typeof loader>();
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
          {moduleTitle.replace(/^lesson\s+\d+\s*[:—–-]\s*/i, '').trim().toLowerCase() !== lessonTitle.toLowerCase() ? (
            <p className="text-sm text-muted-foreground">{moduleTitle}</p>
          ) : null}
        </header>
        {videoUrl ? (
          <video
            data-testid="tutorial-video"
            className="aspect-video w-full rounded-xl border bg-black"
            controls
            preload="metadata"
            src={videoUrl}
          />
        ) : (
          <p data-testid="tutorial-unavailable" className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">
            The video isn’t available right now. Try again in a minute.
          </p>
        )}
      </div>
    </section>
  );
}
