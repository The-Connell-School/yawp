import { useEffect, useRef, useState } from 'react';
import { Form, Link, useNavigation } from 'react-router';
import { Button } from '~/components/ui/button';
import { ChevronRight, RotateCcw } from 'lucide-react';
import z from 'zod';
import { useForm } from '@rvf/react-router';

export default function VideoPlayer({
  videoLink,
  moduleId,
  videoDuration,
  nextModuleId,
  initialCurrentTime,
  onUpdateProgress,
  teacherTrainingId,
}: {
  videoLink: string;
  moduleId: string;
  videoDuration: number | null;
  nextModuleId: string;
  initialCurrentTime: number;
  onUpdateProgress: (currentTime: number) => void;
  teacherTrainingId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialCurrentTime);
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';
  const isComplete = initialCurrentTime === videoDuration;

  const form = useForm({
    schema: z.object({
      moduleId: z.string(),
    }),
    method: 'POST',
    defaultValues: {
      moduleId: moduleId,
    },
    onSubmitSuccess: () => {
      setVideoEnded(false);
      setVideoStarted(false);
      setCurrentTime(initialCurrentTime);

      if (videoRef.current) {
        videoRef.current.play();
      }
    },
  });
  // Reset state and reload video when module changes
  useEffect(() => {
    setVideoEnded(false);
    setVideoStarted(false);
    setCurrentTime(initialCurrentTime);

    if (videoRef.current) {
      videoRef.current.load(); // Force reload of the video source
    }
  }, [moduleId, videoLink]);

  const handlePlay = () => {
    if (videoRef.current) {
      if (!videoStarted) {
        videoRef.current.currentTime = initialCurrentTime;
      }
      videoRef.current.play();
      setVideoStarted(true);
    }
  };

  return (
    <>
      <div
        className={`absolute inset-0 bg-black/50 flex items-center justify-center gap-4 z-20 ${
          videoStarted || videoEnded || isComplete ? 'hidden' : ''
        }`}
      >
        <Button variant="outline" onClick={handlePlay}>
          {initialCurrentTime > 0 ? 'Continue' : 'Start'}
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <video
        key={moduleId} // Force re-render when module changes
        ref={videoRef}
        className="w-full h-full z-10"
        controls
        onEnded={() => setVideoEnded(true)}
        onLoadedMetadata={() => {
          if (videoRef.current && !videoStarted) {
            videoRef.current.currentTime = initialCurrentTime;
          }
        }}
        onTimeUpdate={() => {
          onUpdateProgress(videoRef.current?.currentTime || currentTime);
        }}
        onPause={() => {
          setCurrentTime(videoRef.current?.currentTime || currentTime);
        }}
        onPlay={() => setVideoStarted(true)}
      >
        <source src={videoLink} />
        Your browser does not support the video tag.
      </video>
      {videoEnded || isComplete ? (
        <Form
          method="post"
          className="absolute inset-0 bg-black/75 flex items-center justify-center gap-4"
          {...form.getFormProps()}
        >
          <input type="hidden" name="moduleId" value={moduleId} />
          <Button
            variant="outline"
            disabled={isLoading}
            type="submit"
            name="intent"
            value="restartModule"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Replay
          </Button>
          {teacherTrainingId && nextModuleId ? (
            <Button asChild>
              <Link
                to={`/app/teacher-trainings/${teacherTrainingId}/modules/${nextModuleId}`}
              >
                Next
              </Link>
            </Button>
          ) : null}
        </Form>
      ) : null}
    </>
  );
}
