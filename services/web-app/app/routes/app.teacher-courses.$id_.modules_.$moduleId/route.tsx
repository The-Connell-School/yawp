import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  useLoaderData,
  useFetcher,
  useNavigate,
  Form,
  redirect,
} from 'react-router';
import { Link } from 'react-router';
import {
  ChevronLeft,
  Play,
  SkipForward,
  CheckCircle,
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
import { requireUserId } from '~/utils/auth.server';
import VideoPlayer from './video-player';
import { cn } from '~/utils/misc';
import { Suspense } from 'react';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  // Get teacher profile
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teacherProfile: { select: { id: true } } },
  });

  if (!user?.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const [teacherCourse, currentModule] = await Promise.all([
    prisma.teacherCourse.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        teacherCourseModules: {
          select: {
            id: true,
            title: true,
            position: true,
            videoDuration: true,
            teacherCourseModuleSessions: {
              where: {
                teacherProfileId: user.teacherProfile.id,
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
    prisma.teacherCourseModule.findUnique({
      where: { id: params.moduleId },
      include: {
        resources: {
          select: {
            id: true,
            name: true,
            contentType: true,
          },
        },
        teacherCourseModuleSessions: {
          where: {
            teacherProfileId: user.teacherProfile.id,
          },
          select: {
            id: true,
            videoTimestamp: true,
          },
        },
      },
    }),
  ]);

  if (!teacherCourse) {
    throw new Response('Teacher course not found', { status: 404 });
  }

  if (!currentModule) {
    throw new Response('Module not found', { status: 404 });
  }

  return dataResponse({
    teacherCourse,
    currentModule,
    teacherProfileId: user.teacherProfile.id,
    currentSession: currentModule.teacherCourseModuleSessions[0] || null,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  // Get teacher profile
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teacherProfile: { select: { id: true } } },
  });

  if (!user?.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  if (intent === 'updateProgress') {
    const videoTimestamp = Number(formData.get('videoTimestamp'));
    const module = await prisma.teacherCourseModule.findUniqueOrThrow({
      where: { id: params.moduleId! },
    });
    const session = await prisma.teacherCourseModuleSession.findUnique({
      where: {
        teacherCourseModuleId_teacherProfileId: {
          teacherCourseModuleId: params.moduleId!,
          teacherProfileId: user.teacherProfile.id,
        },
      },
    });
    if (!session) {
      await prisma.teacherCourseModuleSession.create({
        data: {
          teacherCourseModuleId: params.moduleId!,
          teacherProfileId: user.teacherProfile.id,
          videoTimestamp,
        },
      });
    } else {
      await prisma.teacherCourseModuleSession.update({
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
    await prisma.teacherCourseModuleSession.upsert({
      where: {
        teacherCourseModuleId_teacherProfileId: {
          teacherCourseModuleId: params.moduleId!,
          teacherProfileId: user.teacherProfile.id,
        },
      },
      update: {
        videoTimestamp: 0,
        updatedAt: new Date(),
      },
      create: {
        teacherCourseModuleId: params.moduleId!,
        teacherProfileId: user.teacherProfile.id,
        videoTimestamp: 0,
      },
    });

    return dataResponse({ success: true });
  }

  if (intent === 'restartModule') {
    const moduleId = formData.get('moduleId')?.toString();

    if (!moduleId) {
      throw new Response('Module ID required', { status: 400 });
    }

    // Delete existing session for this module and teacher
    await prisma.teacherCourseModuleSession.deleteMany({
      where: {
        teacherCourseModuleId: moduleId,
        teacherProfileId: user.teacherProfile.id,
      },
    });

    // Create new session with default values
    await prisma.teacherCourseModuleSession.create({
      data: {
        teacherCourseModuleId: moduleId,
        teacherProfileId: user.teacherProfile.id,
        videoTimestamp: 0,
      },
    });

    return redirect(`/app/teacher-courses/${params.id}/modules/${moduleId}`);
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

export default function TeacherCourseModuleRoute() {
  const { teacherCourse, currentModule, currentSession } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const currentModuleIndex = teacherCourse.teacherCourseModules.findIndex(
    (m) => m.id === currentModule.id
  );
  const nextModuleId =
    teacherCourse.teacherCourseModules[currentModuleIndex + 1]?.id;

  const downloadResource = (resourceId: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = `/api/teacher-course-module-resource/${resourceId}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const progressPct = Math.ceil(
    ((currentSession?.videoTimestamp || 0) /
      (currentModule.videoDuration || 0)) *
      100
  );

  return (
    <div className="min-h-screen bg-background flex flex-col h-full">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Button variant="outline" asChild>
              <Link to={`/app/teacher-courses/${teacherCourse.id}`}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to Course
              </Link>
            </Button>

            <div className="text-sm text-muted-foreground">
              Module {currentModuleIndex + 1} of{' '}
              {teacherCourse.teacherCourseModules.length}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex-1 overflow-scroll h-full">
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
                      teacherCourseId={teacherCourse.id}
                      nextModuleId={nextModuleId}
                      initialCurrentTime={currentSession?.videoTimestamp || 0}
                      onUpdateProgress={(currentTime) => {
                        fetcher.submit(
                          {
                            intent: 'updateProgress',
                            videoTimestamp: currentTime,
                          },
                          { method: 'post' }
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

            {currentModule.resources.length > 0 && (
              <Card className="bg-muted">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Resources
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {currentModule.resources.map((resource) => (
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
          </div>

          <div className="lg:col-span-2">
            <Card className="sticky top-0 bg-muted">
              <CardHeader>
                <CardTitle className="text-base">Course Modules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                {teacherCourse.teacherCourseModules.map((module, index) => {
                  const isCurrentModule = module.id === currentModule.id;
                  const moduleProgressPct =
                    module.teacherCourseModuleSessions.length > 0
                      ? Math.ceil(
                          ((module.teacherCourseModuleSessions[0]
                            .videoTimestamp || 0) /
                            (module.videoDuration || 0)) *
                            100
                        )
                      : 0;

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
                          to={`/app/teacher-courses/${teacherCourse.id}/modules/${module.id}`}
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
                                {module.teacherCourseModuleSessions.length >
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
                          <DropdownMenuTrigger>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
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
