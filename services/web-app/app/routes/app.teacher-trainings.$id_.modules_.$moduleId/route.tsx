import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  useLoaderData,
  useFetcher,
  Form,
  redirect,
} from 'react-router';
import { Link } from 'react-router';
import {
  ChevronLeft,
  Play,
  Clock,
  FileText,
  Download,
  MoreVertical,
  RotateCcw,
} from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { ThesisDeckLinks } from '~/components/thesis-essay-decks/thesis-deck-links';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { CircularProgress } from '~/components/ui/circular-progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { THESIS_ESSAY_DECKS_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { deckForTrainingModule } from '~/domain/thesis-essay-decks/thesis-essay-decks';
import { availableDeckLinks } from '~/domain/thesis-essay-decks/thesis-essay-decks.server';
import { prisma } from '~/utils/db.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import VideoPlayer from './video-player';
import { cn } from '~/utils/misc';
import { getTeacherTrainingProgressPercent } from '~/utils/teacher-training-progress';
import { getTeacherTrainingMediaAccessibilityResources } from '~/utils/teacher-training-media-accessibility';
import { getTeacherTrainingPlaybackUrl } from '~/utils/teacher-training-video-link.server';
import { redirectIfTeacherLoungeTemporarilyDisabled } from '~/domain/teacher-lounge/teacher-lounge-temporary-disable.server';
import {
  tutorialsForTrainingModule,
  withLessonTutorial,
} from '~/domain/teacher-trainings/lounge-lesson-tutorials';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  await redirectIfTeacherLoungeTemporarilyDisabled({
    userId,
    email: user?.email ?? null,
    orgId: profile.organization.id,
  });

  if (profile.role !== "TEACHER") {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const assignmentCounts = await prisma.orgMembership.findUnique({
    where: { id: profile.id, role: 'TEACHER' },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const hasAssignedCourses =
    (assignmentCounts?._count.assignedTeacherTrainings ?? 0) > 0;

  const [teacherTraining, currentModule] = await Promise.all([
    prisma.teacherTraining.findFirst({
      where: {
        id: params.id,
        ...(hasAssignedCourses
          ? { assignedTeachers: { some: { id: profile.id } } }
          : {}),
      },
      select: {
        id: true,
        title: true,
        teacherTrainingModules: {
          select: {
            id: true,
            title: true,
            position: true,
            videoDuration: true,
            teacherTrainingModuleSessions: {
              where: {
                membershipId: profile.id,
              },
              select: {
                id: true,
                videoTimestamp: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    }),
    prisma.teacherTrainingModule.findFirst({
      where: { id: params.moduleId, teacherTrainingId: params.id },
      include: {
        resources: {
          select: {
            id: true,
            name: true,
            contentType: true,
          },
        },
        teacherTrainingModuleSessions: {
          where: {
            membershipId: profile.id,
          },
          select: {
            id: true,
            videoTimestamp: true,
          },
        },
      },
    }),
  ]);

  if (!teacherTraining) {
    throw new Response('Teacher course not found', { status: 404 });
  }

  if (!currentModule) {
    throw new Response('Module not found', { status: 404 });
  }

  // A lesson of the Thesis-Driven Essay course plays Brian's tutorial for it,
  // which comes with the app, in place of the older video uploaded to the
  // module. Its length and the teacher's progress follow the tutorial.
  const lessonTutorials = tutorialsForTrainingModule(
    teacherTraining.title,
    currentModule.title
  );
  const playbackUrl =
    lessonTutorials[0]?.src ??
    (await getTeacherTrainingPlaybackUrl(currentModule.videoS3Key));
  const taughtModule = withLessonTutorial(teacherTraining.title, currentModule);

  // A Thesis-Driven Essay lesson carries its deck (present, Google Slides,
  // PowerPoint) and lesson plan, as the assignment's Modules do (#452).
  const thesisDeck = deckForTrainingModule(teacherTraining.title, currentModule.title);
  const thesisDeckLinks =
    thesisDeck &&
    (await isFeatureFlagEnabled(THESIS_ESSAY_DECKS_FLAG, profile.organization.id))
      ? availableDeckLinks(thesisDeck, new URL(request.url).pathname)
      : [];

  return dataResponse({
    teacherTraining: {
      ...teacherTraining,
      teacherTrainingModules: teacherTraining.teacherTrainingModules.map(
        (module) => withLessonTutorial(teacherTraining.title, module)
      ),
    },
    currentModule: {
      ...taughtModule,
      videoLink: playbackUrl ?? null,
    },
    lessonTutorials,
    membershipId: profile.id,
    currentSession: taughtModule.teacherTrainingModuleSessions[0] || null,
    thesisDeckLinks,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  await redirectIfTeacherLoungeTemporarilyDisabled({
    userId,
    email: user?.email ?? null,
    orgId: profile.organization.id,
  });
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (profile.role !== "TEACHER") {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const assignmentCounts = await prisma.orgMembership.findUnique({
    where: { id: profile.id, role: 'TEACHER' },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const hasAssignedCourses =
    (assignmentCounts?._count.assignedTeacherTrainings ?? 0) > 0;

  const courseAccess = await prisma.teacherTraining.findFirst({
    where: {
      id: params.id,
      ...(hasAssignedCourses
        ? { assignedTeachers: { some: { id: profile.id } } }
        : {}),
    },
    select: { id: true, title: true },
  });
  if (!courseAccess) {
    throw new Response('Teacher course not found', { status: 404 });
  }

  if (intent === 'updateProgress') {
    const videoTimestamp = Number(formData.get('videoTimestamp'));
    const module = await prisma.teacherTrainingModule.findFirst({
      where: { id: params.moduleId!, teacherTrainingId: params.id },
      select: { id: true, title: true, videoDuration: true },
    });
    if (!module) {
      throw new Response('Module not found', { status: 404 });
    }
    // Watching is counted against the video the teacher is shown: Brian's
    // tutorial where the lesson has one.
    const videoDuration = withLessonTutorial(courseAccess.title, module).videoDuration;
    const session = await prisma.teacherTrainingModuleSession.findUnique({
      where: {
        teacherTrainingModuleId_membershipId: {
          teacherTrainingModuleId: params.moduleId!,
          membershipId: profile.id,
        },
      },
    });
    if (!session) {
      await prisma.teacherTrainingModuleSession.create({
        data: {
          teacherTrainingModuleId: params.moduleId!,
          membershipId: profile.id,
          videoTimestamp,
        },
      });
    } else {
      await prisma.teacherTrainingModuleSession.update({
        where: { id: session.id },
        data: {
          videoTimestamp: Math.min(
            Math.max(videoTimestamp, session.videoTimestamp),
            videoDuration || 0
          ),
          updatedAt: new Date(),
        },
      });
    }

    return dataResponse({ success: true });
  }

  if (intent === 'restartModule') {
    const moduleId =
      formData.get('moduleId')?.toString() ?? params.moduleId?.toString();

    if (!moduleId) {
      throw new Response('Module ID required', { status: 400 });
    }

    const module = await prisma.teacherTrainingModule.findFirst({
      where: { id: moduleId, teacherTrainingId: params.id },
      select: { id: true },
    });
    if (!module) {
      throw new Response('Module not found', { status: 404 });
    }

    await prisma.teacherTrainingModuleSession.upsert({
      where: {
        teacherTrainingModuleId_membershipId: {
          teacherTrainingModuleId: moduleId,
          membershipId: profile.id,
        },
      },
      update: { videoTimestamp: 0, updatedAt: new Date() },
      create: {
        teacherTrainingModuleId: moduleId,
        membershipId: profile.id,
        videoTimestamp: 0,
        updatedAt: new Date(),
      },
    });

    return redirect(`/app/teacher-trainings/${params.id}/modules/${moduleId}`);
  }

  return dataResponse({ success: false });
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

export default function TeacherTrainingModuleRoute() {
  const {
    teacherTraining,
    currentModule,
    currentSession,
    thesisDeckLinks,
    lessonTutorials,
  } = useLoaderData<typeof loader>();
  // Brian's tutorial for this lesson, where it has one, and any that follow
  // it (Body paragraphs has a second, on supporting quotes).
  const [lessonTutorial, ...moreTutorials] = lessonTutorials;
  const fetcher = useFetcher();

  const currentModuleIndex = teacherTraining.teacherTrainingModules.findIndex(
    (m) => m.id === currentModule.id
  );
  const nextModuleId =
    teacherTraining.teacherTrainingModules[currentModuleIndex + 1]?.id;

  const downloadResource = (resourceId: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = `/api/teacher-training-module-resource/${resourceId}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const progressPct = getTeacherTrainingProgressPercent(
    currentSession?.videoTimestamp,
    currentModule.videoDuration
  );
  const uploaded = getTeacherTrainingMediaAccessibilityResources(
    currentModule.resources
  );
  const primaryResources = currentModule.resources.filter(
    (resource) =>
      resource.id !== uploaded.captionResource?.id &&
      resource.id !== uploaded.transcriptResource?.id
  );
  // The uploaded captions and transcript are of the uploaded video. With a
  // tutorial playing, its own captions take their place and the old
  // transcript is not offered: it is of a video the teacher no longer sees.
  const captionsHref = lessonTutorial
    ? lessonTutorial.captions
    : uploaded.captionResource
      ? `/api/teacher-training-module-resource/${uploaded.captionResource.id}`
      : null;
  const transcriptResource = lessonTutorial ? null : uploaded.transcriptResource;
  const captionTrack = captionsHref
    ? { src: captionsHref, label: 'English captions', srcLang: 'en' }
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col h-full">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Button variant="outline" asChild>
              <Link to={`/app/teacher-trainings/${teacherTraining.id}`}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to Course
              </Link>
            </Button>

            <div className="text-sm text-muted-foreground">
              Module {currentModuleIndex + 1} of{' '}
              {teacherTraining.teacherTrainingModules.length}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex-1 overflow-scroll h-full">
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-6">
            <Card className="bg-muted">
              <CardContent className="p-0">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  {currentModule.videoLink ? (
                    <VideoPlayer
                      videoLink={currentModule.videoLink}
                      moduleId={currentModule.id}
                      videoDuration={currentModule.videoDuration}
                      teacherTrainingId={teacherTraining.id}
                      nextModuleId={nextModuleId}
                      initialCurrentTime={currentSession?.videoTimestamp || 0}
                      captionTrack={captionTrack}
                      poster={lessonTutorial?.poster}
                      onUpdateProgress={(currentTime) => {
                        const formData = new FormData();
                        formData.append('intent', 'updateProgress');
                        formData.append(
                          'videoTimestamp',
                          currentTime.toString()
                        );
                        fetch(
                          `/app/teacher-trainings/${teacherTraining.id}/modules/${currentModule.id}`,
                          {
                            method: 'POST',
                            body: formData,
                          }
                        );
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-muted-foreground">
                        <Play className="mx-auto h-16 w-16 mb-4" />
                        <p>No video available for this module</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted">
              <CardHeader>
                <CardTitle>{currentModule.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {currentModule.description && (
                  <p className="text-muted-foreground mb-4">
                    {currentModule.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-sm">
                  {currentModule.videoDuration && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{formatTime(currentModule.videoDuration)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        'text-primary font-medium',
                        progressPct === 100 ? 'text-green-600' : ''
                      )}
                    >
                      {progressPct}% watched
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {moreTutorials.length > 0 && (
              <div className="space-y-6" data-testid="teacher-training-more-tutorials">
                {moreTutorials.map((tutorial) => (
                  <Card key={tutorial.src} className="bg-muted">
                    <CardHeader>
                      <CardTitle>{tutorial.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Also for this lesson · about {tutorial.minutes} min
                      </p>
                    </CardHeader>
                    <CardContent>
                      <video
                        className="aspect-video w-full rounded-lg bg-black"
                        controls
                        playsInline
                        preload="metadata"
                        poster={tutorial.poster}
                        aria-label={`${tutorial.title}: tutorial video`}
                        src={tutorial.src}
                      >
                        <track
                          kind="captions"
                          src={tutorial.captions}
                          srcLang="en"
                          label="English captions"
                          default
                        />
                      </video>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {thesisDeckLinks.length > 0 && (
              <Card data-testid="teacher-training-thesis-deck">
                <CardHeader>
                  <CardTitle>Teach this lesson</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Present the slides on Yawp!, or make your own copy in Google
                    Slides or PowerPoint to edit. The lesson plan goes with them.
                  </p>
                </CardHeader>
                <CardContent>
                  <ThesisDeckLinks links={thesisDeckLinks} />
                </CardContent>
              </Card>
            )}

            {(primaryResources.length > 0 ||
              captionsHref ||
              transcriptResource) && (
              <div className="space-y-3">
                {primaryResources.length > 0 && (
                  <Card
                    className="bg-muted"
                    data-testid="teacher-training-primary-resources"
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        Resources
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {primaryResources.map((resource) => (
                          <div
                            key={resource.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{resource.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {resource.contentType}
                                </p>
                              </div>
                            </div>
                            <Button
                              onClick={() =>
                                downloadResource(resource.id, resource.name)
                              }
                              size="sm"
                              variant="outline"
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {(captionsHref || transcriptResource) && (
                  <section
                    aria-labelledby="teacher-training-media-accessibility-heading"
                    className="px-1 text-xs text-muted-foreground/80"
                    data-testid="teacher-training-media-accessibility"
                  >
                    <h3
                      id="teacher-training-media-accessibility-heading"
                      className="sr-only"
                    >
                      Media accessibility files
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-muted-foreground/80">
                        Media accessibility
                      </span>
                      {captionsHref ? (
                        <a
                          className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          href={captionsHref}
                          download
                        >
                          Captions
                        </a>
                      ) : null}
                      {transcriptResource ? (
                        <a
                          className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          href={`/api/teacher-training-module-resource/${transcriptResource.id}`}
                          download
                        >
                          Transcript
                        </a>
                      ) : null}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <Card className="sticky top-0 bg-muted">
              <CardHeader>
                <CardTitle className="text-base">Course Modules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                {teacherTraining.teacherTrainingModules.map((module, index) => {
                  const isCurrentModule = module.id === currentModule.id;
                  const moduleProgressPct = getTeacherTrainingProgressPercent(
                    module.teacherTrainingModuleSessions[0]?.videoTimestamp,
                    module.videoDuration
                  );

                  return (
                    <div
                      key={module.id}
                      className={cn(
                        'block p-3 rounded-lg border transition-all hover:bg-muted/50',
                        isCurrentModule ? 'bg-primary/10 border-primary' : '',
                        moduleProgressPct === 100
                          ? 'bg-green-300/10 border-green-600 text-green-600'
                          : ''
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/app/teacher-trainings/${teacherTraining.id}/modules/${module.id}`}
                          className="flex-1 min-w-0"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <CircularProgress
                                progress={moduleProgressPct}
                                index={index + 1}
                                size="sm"
                                className={
                                  isCurrentModule
                                    ? ' ring-offset-2 ring-offset-background'
                                    : ''
                                }
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <h4
                                className={cn(
                                  'text-sm font-medium line-clamp-2',
                                  isCurrentModule ? 'text-primary' : '',
                                  moduleProgressPct === 100
                                    ? 'text-green-600'
                                    : ''
                                )}
                              >
                                {module.title}
                              </h4>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                {module.videoDuration && (
                                  <span>
                                    {formatTime(module.videoDuration)}
                                  </span>
                                )}
                                {module.teacherTrainingModuleSessions.length >
                                  0 && (
                                  <span
                                    className={cn(
                                      'text-primary',
                                      moduleProgressPct === 100
                                        ? 'text-green-600'
                                        : ''
                                    )}
                                  >
                                    {moduleProgressPct}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>

                        <DropdownMenu>
                          {/* asChild: the trigger is this button, not a
                              button around it. A button inside a button is
                              not valid HTML, so the browser moved it and the
                              page failed to hydrate. */}
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              aria-label="Module options"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <Form method="post">
                              <input
                                type="hidden"
                                name="moduleId"
                                value={module.id}
                              />
                              <DropdownMenuItem>
                                <button
                                  type="submit"
                                  name="intent"
                                  value="restartModule"
                                  className="w-full flex items-center"
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Restart Module
                                </button>
                              </DropdownMenuItem>
                            </Form>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
