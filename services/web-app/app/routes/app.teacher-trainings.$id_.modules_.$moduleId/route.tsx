import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  useLoaderData,
  useFetcher,
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
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { CircularProgress } from '~/components/ui/circular-progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { prisma } from '~/utils/db.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import VideoPlayer from './video-player';
import { cn } from '~/utils/misc';
import { getTeacherTrainingProgressPercent } from '~/utils/teacher-training-progress';
import { getTeacherTrainingMediaAccessibilityResources } from '~/utils/teacher-training-media-accessibility';
import { getTeacherTrainingPlaybackUrl } from '~/utils/teacher-training-video-link.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

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

  const playbackUrl = await getTeacherTrainingPlaybackUrl(
    currentModule.videoS3Key
  );

  return dataResponse({
    teacherTraining,
    currentModule: currentModule
      ? {
          ...currentModule,
          videoLink: playbackUrl ?? null,
        }
      : currentModule,
    membershipId: profile.id,
    currentSession: currentModule.teacherTrainingModuleSessions[0] || null,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
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
    select: { id: true },
  });
  if (!courseAccess) {
    throw new Response('Teacher course not found', { status: 404 });
  }

  if (intent === 'updateProgress') {
    const videoTimestamp = Number(formData.get('videoTimestamp'));
    const module = await prisma.teacherTrainingModule.findFirst({
      where: { id: params.moduleId!, teacherTrainingId: params.id },
      select: { id: true, videoDuration: true },
    });
    if (!module) {
      throw new Response('Module not found', { status: 404 });
    }
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
            module.videoDuration || 0
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
  const { teacherTraining, currentModule, currentSession } =
    useLoaderData<typeof loader>();
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
  const { captionResource, transcriptResource } =
    getTeacherTrainingMediaAccessibilityResources(currentModule.resources);
  const primaryResources = currentModule.resources.filter(
    (resource) =>
      resource.id !== captionResource?.id &&
      resource.id !== transcriptResource?.id
  );
  const captionTrack = captionResource
    ? {
        src: `/api/teacher-training-module-resource/${captionResource.id}`,
        label: 'English captions',
        srcLang: 'en',
      }
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
                      <div className="text-center text-white/70">
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

            {(primaryResources.length > 0 ||
              captionResource ||
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

                {(captionResource || transcriptResource) && (
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
                      {captionResource ? (
                        <a
                          className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          href={`/api/teacher-training-module-resource/${captionResource.id}`}
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

                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="relative h-6 w-6 p-0"
                              aria-label={`Module actions for ${module.title}`}
                            >
                              <span
                                className="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
                                aria-hidden="true"
                              />
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-popover-foreground"
                              onSelect={() => {
                                fetcher.submit(
                                  {
                                    intent: 'restartModule',
                                    moduleId: module.id,
                                  },
                                  { method: 'post' }
                                );
                              }}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Restart Module
                            </DropdownMenuItem>
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
