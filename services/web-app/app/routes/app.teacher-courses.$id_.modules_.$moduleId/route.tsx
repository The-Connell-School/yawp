import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  useLoaderData,
  useFetcher,
  useNavigate,
} from 'react-router';
import { Link } from 'react-router';
import {
  ChevronLeft,
  Play,
  Pause,
  SkipForward,
  CheckCircle,
  Clock,
  FileText,
  Download,
  X,
  MoreVertical,
  RotateCcw,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Progress } from '~/components/ui/progress';
import { CircularProgress } from '~/components/ui/circular-progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';

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
                videoProgress: true,
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
            videoProgress: true,
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
    const videoProgress = Number(formData.get('videoProgress'));
    const sessionId = formData.get('sessionId')?.toString();

    if (sessionId) {
      // Update existing session
      await prisma.teacherCourseModuleSession.update({
        where: { id: sessionId },
        data: {
          videoTimestamp,
          videoProgress,
          updatedAt: new Date(),
        },
      });
    } else {
      // Upsert session - create if doesn't exist, update if it does
      await prisma.teacherCourseModuleSession.upsert({
        where: {
          teacherCourseModuleId_teacherProfileId: {
            teacherCourseModuleId: params.moduleId!,
            teacherProfileId: user.teacherProfile.id,
          },
        },
        update: {
          videoTimestamp,
          videoProgress,
          updatedAt: new Date(),
        },
        create: {
          teacherCourseModuleId: params.moduleId!,
          teacherProfileId: user.teacherProfile.id,
          videoTimestamp,
          videoProgress,
        },
      });
    }

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
        videoProgress: 0,
      },
    });

    return dataResponse({ success: true });
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

function getModuleStatus(sessions: any[]) {
  if (!sessions || sessions.length === 0) {
    return {
      status: 'not-started',
      icon: Clock,
      color: 'text-muted-foreground',
    };
  }

  const progress = sessions[0].videoProgress;
  if (progress >= 100) {
    return { status: 'completed', icon: CheckCircle, color: 'text-green-600' };
  } else if (progress > 0) {
    return { status: 'in-progress', icon: Play, color: 'text-blue-600' };
  } else {
    return {
      status: 'not-started',
      icon: Clock,
      color: 'text-muted-foreground',
    };
  }
}

export default function TeacherCourseModuleRoute() {
  const { teacherCourse, currentModule, teacherProfileId, currentSession } =
    useLoaderData<typeof loader>();
  const restartFetcher = useFetcher();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(
    currentSession?.videoTimestamp || 0
  );
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(currentSession?.videoProgress || 0);
  const [lastSavedTime, setLastSavedTime] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const currentSessionIdRef = useRef<string | null>(currentSession?.id || null);

  // Update session ID ref when currentSession changes (e.g., after restart)
  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id || null;
  }, [currentSession]);

  // Find current module index and next module
  const currentModuleIndex = teacherCourse.teacherCourseModules.findIndex(
    (m) => m.id === currentModule.id
  );
  const nextModule = teacherCourse.teacherCourseModules[currentModuleIndex + 1];

  const handleRestartModule = (moduleId: string) => {
    const formData = new FormData();
    formData.append('intent', 'restartModule');
    formData.append('moduleId', moduleId);

    restartFetcher.submit(formData, { method: 'post' });
  };

  // Reload page when restart is successful
  useEffect(() => {
    if (restartFetcher.data?.success) {
      window.location.reload();
    }
  }, [restartFetcher.data]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current && currentTime > 0) {
        const formData = new FormData();
        formData.append('intent', 'updateProgress');
        formData.append('videoTimestamp', currentTime.toString());
        formData.append('videoProgress', progress.toString());
        if (currentSessionIdRef.current) {
          formData.append('sessionId', currentSessionIdRef.current);
        }

        // Use synchronous XMLHttpRequest for reliable delivery on page unload
        const xhr = new XMLHttpRequest();
        xhr.open('POST', window.location.pathname, false); // synchronous
        xhr.send(formData);
      }
    };
  }, [currentTime, progress]);

  // Reset video state when module changes
  useEffect(() => {
    setCurrentTime(currentSession?.videoTimestamp || 0);
    setProgress(currentSession?.videoProgress || 0);
    setLastSavedTime(0);
    setVideoEnded(false);
    setDuration(0);

    // Reset video element
    if (videoRef.current) {
      videoRef.current.currentTime = currentSession?.videoTimestamp || 0;
      videoRef.current.pause();
    }
  }, [currentModule.id, currentSession]);

  // Force video reset when module changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = currentSession?.videoTimestamp || 0;
        videoRef.current.pause();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [currentModule.id]);

  // Set initial video time when session data loads
  useEffect(() => {
    if (videoRef.current && currentSession?.videoTimestamp) {
      videoRef.current.currentTime = currentSession.videoTimestamp;
      setCurrentTime(currentSession.videoTimestamp);
    }
  }, [currentSession]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleVideoEnd = useCallback(() => {
    setVideoEnded(true);
    // Mark as completed
    const formData = new FormData();
    formData.append('intent', 'updateProgress');
    formData.append('videoTimestamp', duration.toString());
    formData.append('videoProgress', '100');
    if (currentSessionIdRef.current) {
      formData.append('sessionId', currentSessionIdRef.current);
    }

    // Use fetch directly to avoid re-renders
    fetch(window.location.pathname, {
      method: 'POST',
      body: formData,
    });
  }, [duration]);

  const downloadResource = (resourceId: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = `/api/teacher-course-module-resource/${resourceId}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Video Player */}
            <Card className="bg-muted">
              <CardContent className="p-0">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  {currentModule.videoLink ? (
                    <video
                      key={currentModule.id}
                      ref={videoRef}
                      className="w-full h-full"
                      controls
                      onEnded={handleVideoEnd}
                      onLoadedMetadata={handleLoadedMetadata}
                      onTimeUpdate={() => {
                        if (videoRef.current) {
                          setCurrentTime(videoRef.current.currentTime);
                        }
                      }}
                    >
                      <source src={currentModule.videoLink} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-muted-foreground">
                        <Play className="mx-auto h-16 w-16 mb-4" />
                        <p>No video available for this module</p>
                      </div>
                    </div>
                  )}

                  {/* Video Controls Overlay - Only show when video ends */}
                  {videoEnded && (
                    <div className="absolute inset-0 bg-black/75 flex items-center justify-center gap-4">
                      <Button
                        onClick={() => handleRestartModule(currentModule.id)}
                        size="sm"
                        variant="outline"
                        disabled={restartFetcher.state === 'submitting'}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Replay
                      </Button>
                      {nextModule && (
                        <Button
                          onClick={() =>
                            navigate(
                              `/app/teacher-courses/${teacherCourse.id}/modules/${nextModule.id}`
                            )
                          }
                          size="sm"
                        >
                          <SkipForward className="mr-2 h-4 w-4" />
                          Next
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Module Info */}
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
                    <span className="text-primary font-medium">
                      {Math.ceil(progress)}% watched
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resources */}
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

          {/* Sidebar - Module Navigation */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6 bg-muted">
              <CardHeader>
                <CardTitle className="text-base">Course Modules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                {teacherCourse.teacherCourseModules.map((module, index) => {
                  const moduleStatus = getModuleStatus(
                    module.teacherCourseModuleSessions
                  );
                  const StatusIcon = moduleStatus.icon;
                  const isCurrentModule = module.id === currentModule.id;

                  return (
                    <div
                      key={module.id}
                      className={`group block p-3 rounded-lg border transition-all hover:bg-muted/50 ${
                        isCurrentModule ? 'bg-primary/10 border-primary' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Link
                          to={`/app/teacher-courses/${teacherCourse.id}/modules/${module.id}`}
                          className="flex-1 min-w-0"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <CircularProgress
                                progress={
                                  module.teacherCourseModuleSessions[0]
                                    ?.videoProgress || 0
                                }
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
                                className={`text-sm font-medium line-clamp-2 ${
                                  isCurrentModule ? 'text-primary' : ''
                                }`}
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
                                  <span className="text-primary">
                                    {Math.ceil(
                                      module.teacherCourseModuleSessions[0]
                                        .videoProgress
                                    )}
                                    %
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleRestartModule(module.id)}
                              disabled={restartFetcher.state === 'submitting'}
                            >
                              <Play className="mr-2 h-4 w-4" />
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
