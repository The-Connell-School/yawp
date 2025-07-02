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
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Progress } from '~/components/ui/progress';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import { YouTubePlayer } from './youtube-player';

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
      // Create new session
      await prisma.teacherCourseModuleSession.create({
        data: {
          teacherCourseModuleId: params.moduleId!,
          teacherProfileId: user.teacherProfile.id,
          videoTimestamp,
          videoProgress,
        },
      });
    }

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
  if (progress >= 95) {
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
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(
    currentSession?.videoTimestamp || 0
  );
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(currentSession?.videoProgress || 0);
  const [showAutoplayCountdown, setShowAutoplayCountdown] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [lastSavedTime, setLastSavedTime] = useState(0);
  const [isYouTubeVideo, setIsYouTubeVideo] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);

  // Find current module index and next module
  const currentModuleIndex = teacherCourse.teacherCourseModules.findIndex(
    (m) => m.id === currentModule.id
  );
  const nextModule = teacherCourse.teacherCourseModules[currentModuleIndex + 1];

  // Extract YouTube video ID from URL
  useEffect(() => {
    if (
      currentModule.videoLink &&
      !currentModule.videoLink.startsWith('/api')
    ) {
      const youtubeRegex =
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
      const match = currentModule.videoLink.match(youtubeRegex);
      if (match) {
        setYoutubeVideoId(match[1]);
        setIsYouTubeVideo(true);
      }
    }
  }, [currentModule.videoLink]);

  // Set initial video time when session data loads (for non-YouTube videos)
  useEffect(() => {
    if (videoRef.current && currentSession?.videoTimestamp && !isYouTubeVideo) {
      videoRef.current.currentTime = currentSession.videoTimestamp;
      setCurrentTime(currentSession.videoTimestamp);
    }
  }, [currentSession, isYouTubeVideo]);

  // Progress tracking for non-YouTube videos
  useEffect(() => {
    if (isYouTubeVideo) return; // YouTube progress is handled by the YouTubePlayer component

    const interval = setInterval(() => {
      if (videoRef.current && isPlaying) {
        const currentTime = videoRef.current.currentTime;
        const videoDuration = videoRef.current.duration;

        if (videoDuration > 0) {
          const newProgress = (currentTime / videoDuration) * 100;
          setProgress(newProgress);
          setCurrentTime(currentTime);

          // Save progress every 10 seconds to avoid too many requests
          if (Math.abs(currentTime - lastSavedTime) >= 10) {
            setLastSavedTime(currentTime);

            const formData = new FormData();
            formData.append('intent', 'updateProgress');
            formData.append('videoTimestamp', currentTime.toString());
            formData.append('videoProgress', newProgress.toString());
            if (currentSession?.id) {
              formData.append('sessionId', currentSession.id);
            }

            fetcher.submit(formData, { method: 'post' });
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, lastSavedTime, currentSession, fetcher, isYouTubeVideo]);

  // Auto-play countdown when video ends
  useEffect(() => {
    let countdownInterval: NodeJS.Timeout;

    if (showAutoplayCountdown && nextModule) {
      countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Navigate to next module
            navigate(
              `/app/teacher-courses/${teacherCourse.id}/modules/${nextModule.id}`
            );
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, [showAutoplayCountdown, nextModule, navigate, teacherCourse.id]);

  const handleLoadedMetadata = () => {
    if (videoRef.current && !isYouTubeVideo) {
      setDuration(videoRef.current.duration);
    }
  };

  // YouTube player event handlers
  const handleYouTubeTimeUpdate = useCallback(
    (currentTime: number, duration: number) => {
      setCurrentTime(currentTime);
      setDuration(duration);

      if (duration > 0) {
        const newProgress = (currentTime / duration) * 100;
        setProgress(newProgress);

        // Save progress every 10 seconds to avoid too many requests
        if (Math.abs(currentTime - lastSavedTime) >= 10) {
          setLastSavedTime(currentTime);

          const formData = new FormData();
          formData.append('intent', 'updateProgress');
          formData.append('videoTimestamp', currentTime.toString());
          formData.append('videoProgress', newProgress.toString());
          if (currentSession?.id) {
            formData.append('sessionId', currentSession.id);
          }

          fetcher.submit(formData, { method: 'post' });
        }
      }
    },
    [lastSavedTime, currentSession, fetcher]
  );

  const handleYouTubeStateChange = useCallback((isPlaying: boolean) => {
    setIsPlaying(isPlaying);
  }, []);

  const handleVideoEnd = useCallback(() => {
    // Mark as completed and show auto-play if there's a next module
    const formData = new FormData();
    formData.append('intent', 'updateProgress');
    formData.append('videoTimestamp', duration.toString());
    formData.append('videoProgress', '100');
    if (currentSession?.id) {
      formData.append('sessionId', currentSession.id);
    }

    fetcher.submit(formData, { method: 'post' });

    if (nextModule) {
      setShowAutoplayCountdown(true);
      setCountdown(5);
    }
  }, [duration, currentSession, fetcher, nextModule]);

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
            <Button variant="ghost" asChild>
              <Link to={`/app/teacher-courses/${teacherCourse.id}`}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                {teacherCourse.title}
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
                  {currentModule.videoLink?.startsWith('/api') ? (
                    <video
                      ref={videoRef}
                      className="w-full h-full"
                      controls
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
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
                  ) : isYouTubeVideo && youtubeVideoId ? (
                    <YouTubePlayer
                      videoId={youtubeVideoId}
                      initialTime={currentSession?.videoTimestamp || 0}
                      onTimeUpdate={handleYouTubeTimeUpdate}
                      onStateChange={handleYouTubeStateChange}
                      onEnded={handleVideoEnd}
                    />
                  ) : currentModule.videoLink ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-muted-foreground">
                        <Play className="mx-auto h-16 w-16 mb-4" />
                        <p>Invalid video URL</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-muted-foreground">
                        <Play className="mx-auto h-16 w-16 mb-4" />
                        <p>No video available for this module</p>
                      </div>
                    </div>
                  )}

                  {/* Auto-play Countdown Overlay */}
                  {showAutoplayCountdown && nextModule && (
                    <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                      <div className="bg-card p-6 rounded-lg text-center max-w-sm">
                        <div className="text-6xl font-bold text-primary mb-4">
                          {countdown}
                        </div>
                        <h3 className="text-lg font-semibold mb-2">
                          Next Module Starting Soon
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {nextModule.title}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setShowAutoplayCountdown(false)}
                            variant="outline"
                            size="sm"
                          >
                            <X className="mr-2 h-4 w-4" />
                            Cancel
                          </Button>
                          <Button
                            onClick={() =>
                              navigate(
                                `/app/teacher-courses/${teacherCourse.id}/modules/${nextModule.id}`
                              )
                            }
                            size="sm"
                          >
                            <SkipForward className="mr-2 h-4 w-4" />
                            Play Now
                          </Button>
                        </div>
                      </div>
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
                      {Math.round(progress)}% watched
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
                    <Link
                      key={module.id}
                      to={`/app/teacher-courses/${teacherCourse.id}/modules/${module.id}`}
                      className={`block p-3 rounded-lg border transition-all hover:bg-muted/50 ${
                        isCurrentModule ? 'bg-primary/10 border-primary' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1 min-w-fit">
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                              isCurrentModule
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            {index + 1}
                          </div>
                          <StatusIcon
                            className={`h-3 w-3 ${moduleStatus.color}`}
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
                              <span>{formatTime(module.videoDuration)}</span>
                            )}
                            {module.teacherCourseModuleSessions.length > 0 && (
                              <span className="text-primary">
                                {Math.round(
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
