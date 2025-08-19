import { useFetcher, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AudioLines,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageSquareOff,
  MessageSquareText,
  PauseCircleIcon,
  PlayCircle,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Slider } from '~/components/ui/slider.js';
import { Switch } from '~/components/ui/switch';
import { Tooltip } from '~/components/ui/tooltip';
import { useAsyncFetcherSubmit } from '~/hooks/useAsyncFetcher.ts';
import { useAudio } from '~/hooks/useAudio.js';
import { useUser } from '~/hooks/useUser';
import { cn } from '~/utils/misc';
import { timeAgo } from '~/utils/timeAgo/timeAgo';
import { Loading } from './loading';
import { ResponseBar } from './response-bar';

type Props = {
  docId: string;
  nextCmId?: string;
  hasPreviousCms?: boolean;
  cms: {
    studentCourseModule: {
      studentCourse: {
        studentCourseModules: { id: string; position: number }[];
      } | null;
      instructions: {
        buttons: { id: string; label: string; action: string }[];
        id: string;
        title: string;
        prompt: string;
        showChatButton: boolean | null;
        showNextButton: boolean | null;
      }[];
      title: string;
      isSelfGuided: boolean;
    };
    messages: { id: string; agent: string; content: string; createdAt: Date }[];
    id: string;
    instructionsCompleted: number;
  };
};

function base64ToArrayBuffer(base64: string) {
  var binary_string = window.atob(base64);
  var len = binary_string.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export const Tutor = ({ cms, nextCmId, docId, hasPreviousCms }: Props) => {
  const [messagesExpanded, setMessagesExpanded] = useLocalStorage(
    `doc-${docId}-tutor-messages-expanded`,
    true
  );
  const [showResetConfirmation, setShowResetConfirmation] = useLocalStorage(
    `doc-${docId}-reset-confirmation`,
    false
  );
  const tutorResponseFetcher = useFetcher<{ error?: string; audio?: string }>();
  const incrementInstructionFetcher = useFetcher();
  const advanceCourseModuleFetcher = useFetcher();
  const audioFetcher = useFetcher<{ audio: string }>();
  const messagesRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const shouldPlayAudio = searchParams.get('spa') === '1';
  const audioControls = useAudio(audioRef.current);
  const cmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;

  const [speechEnabled, setSpeechEnabled] = useLocalStorage(
    'speechEnabled',
    false
  );
  const [speechSpeed, setSpeechSpeed] = useLocalStorage('speechSpeed', 1);

  const finishedCms =
    cms.instructionsCompleted === cms.studentCourseModule.instructions.length;
  const isLastCmInstruction =
    cms.instructionsCompleted ===
    cms.studentCourseModule.instructions.length - 1;

  const instruction =
    cms.studentCourseModule.instructions[cms.instructionsCompleted] ?? {};

  const prevCmsIdx = hasPreviousCms ? cmsIdx + 1 : undefined;
  const nextCmsIdx = cmsIdx > 0 ? cmsIdx - 1 : undefined;
  const isCurrentCms = cmsIdx === 0;

  const optimistic = tutorResponseFetcher.formData;
  const optimisticMessage = optimistic
    ? ({
        agent: 'user',
        createdAt: new Date(),
        content: optimistic.get('response'),
      } as any)
    : null;

  const user = useUser();
  const userIsAdmin = user.isAdmin;
  const userIsTeacher = user.selectedProfile?.teacherProfile !== null;
  const { submit, isLoading } = useAsyncFetcherSubmit();

  const respond = (response: string) => {
    tutorResponseFetcher.submit(
      {
        response,
        cmsId: cms.id,
        speechEnabled,
        speechSpeed: '1.5',
        content: localStorage.getItem(`document-${docId}`),
      },
      { method: 'POST', action: '/api/domain/tutor-response' }
    );
  };

  const incrementInstruction = () => {
    incrementInstructionFetcher.submit(
      { 'instructionsCompleted.increment': 1 },
      {
        method: 'POST',
        action: `/api/model/course-module-session/${cms.id}`,
      }
    );
  };

  const decrementInstruction = () => {
    incrementInstructionFetcher.submit(
      { 'instructionsCompleted.decrement': 1 },
      {
        method: 'POST',
        action: `/api/model/course-module-session/${cms.id}`,
      }
    );
  };

  const advanceToNextCourseModule = () => {
    advanceCourseModuleFetcher.submit(
      { courseModuleId: nextCmId ?? '', documentId: docId },
      {
        method: 'POST',
        action: '/api/model/course-module-session',
      }
    );
  };

  const playBase64StringAudio = (base64: string) => {
    const audioData = base64;
    const audioArrayBuffer = base64ToArrayBuffer(audioData);
    const audioBlob = new Blob([audioArrayBuffer]);
    const audioUrl = URL.createObjectURL(audioBlob);
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      audioRef.current.play();
      audioRef.current.playbackRate = speechSpeed;
      audioRef.current.onended = () => audioControls.setIsPlaying(false);
    }
  };

  const messages = cms.messages
    .filter((m) => ['user', 'assistant'].includes(m.agent))
    .concat(optimisticMessage ?? [])
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);

  useEffect(() => {
    if (speechEnabled && tutorResponseFetcher.data?.audio?.length) {
      playBase64StringAudio(tutorResponseFetcher.data!.audio!);
      audioControls.setIsPlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorResponseFetcher.data, speechEnabled]);

  useEffect(() => {
    if (shouldPlayAudio) {
      const { pathname, search } = window.location;
      const searchParams = new URLSearchParams(search);
      searchParams.delete('spa');
      navigate(`${pathname}?${searchParams}`, { replace: true });

      if (speechEnabled) {
        audioFetcher.load(`/api/domain/audio/${instruction.id}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlayAudio, navigate]);

  useEffect(() => {
    if (audioFetcher.data?.audio) {
      playBase64StringAudio(audioFetcher.data.audio);
      audioControls.setIsPlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioFetcher.data]);

  const handleReset = () => {
    setShowResetConfirmation(true);
  };

  const confirmReset = async () => {
    await submit(
      { cmsId: cms.id },
      {
        method: 'POST',
        action: '/api/domain/delete-subsequent-cms',
      }
    );
    setShowResetConfirmation(false);
    setSearchParams((prev) => {
      prev.delete('cmsIdx');
      return prev;
    });
  };

  return (
    <div className="flex w-full flex-col border-r pb-2 md:w-3/5">
      <audio ref={audioRef} hidden />
      <div
        className={cn(
          'flex items-center justify-between gap-8 py-1 pl-4 pr-2',
          cms.studentCourseModule.isSelfGuided ? '' : 'border-b'
        )}
      >
        <div className="flex h-[32px] w-full items-center gap-1">
          <div className="flex flex-grow items-center gap-2">
            <Tooltip text="Previous step" delayDuration={0}>
              <Button
                variant="secondary"
                size="icon-sm"
                disabled={prevCmsIdx === undefined}
                onClick={() =>
                  prevCmsIdx !== undefined &&
                  navigate(`/app/documents/${docId}?cmsIdx=${prevCmsIdx}`)
                }
              >
                <ChevronLeftIcon size={20} />
              </Button>
            </Tooltip>
            <p className="text-sm font-bold text-foreground/80">
              {cms.studentCourseModule.title}
            </p>
            <Tooltip text="Next step" delayDuration={0}>
              <Button
                variant="secondary"
                size="icon-sm"
                disabled={nextCmsIdx === undefined}
                onClick={() =>
                  nextCmsIdx !== undefined &&
                  navigate(`/app/documents/${docId}?cmsIdx=${nextCmsIdx}`)
                }
              >
                <ChevronRightIcon size={20} />
              </Button>
            </Tooltip>
          </div>
          {cms.studentCourseModule.isSelfGuided ? null : (
            <Tooltip
              text={messagesExpanded ? 'Hide messages' : 'Show messages'}
              delayDuration={0}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                className="min-w-8"
                onClick={() => setMessagesExpanded(!messagesExpanded)}
              >
                {messagesExpanded ? (
                  <MessageSquareOff size={20} />
                ) : (
                  <MessageSquareText size={20} />
                )}
              </Button>
            </Tooltip>
          )}
          {cms.studentCourseModule.isSelfGuided ? null : (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="min-w-8">
                  <AudioLines
                    size={20}
                    strokeWidth={2}
                    className={
                      audioControls.isPlaying ? 'text-primary' : undefined
                    }
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="-mt-0.5">
                <p className="mb-2 font-bold">Audio</p>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm">Enabled</p>
                  <Switch
                    checked={speechEnabled}
                    onCheckedChange={setSpeechEnabled}
                  />
                </div>
                <div className="border-b-black-100 my-2 border-b" />
                <div
                  className={cn(
                    'grid grid-cols-4',
                    !speechEnabled && 'pointer-events-none opacity-50'
                  )}
                >
                  <div className="flex flex-col items-center">
                    <p className="mb-0.5 text-sm text-muted-foreground">
                      {audioControls.isPlaying ? 'Playing...' : 'Stopped'}
                    </p>
                    <Button
                      onClick={audioControls.togglePlayPause}
                      size="sm"
                      variant="ghost"
                      disabled={audioRef.current?.src === ''}
                    >
                      {audioControls.isPlaying ? (
                        <PauseCircleIcon />
                      ) : (
                        <PlayCircle />
                      )}
                    </Button>
                  </div>
                  <div className="col-span-3 w-full">
                    <p className="w-full text-center text-sm text-muted-foreground">
                      Speed
                    </p>
                    <div className="mt-4 flex items-end">
                      <Slider
                        min={0.9}
                        max={2.1}
                        step={0.2}
                        value={[speechSpeed]}
                        onValueChange={([v]) => {
                          audioControls.setPlaybackRate(v);
                          setSpeechSpeed(v);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      {cms.studentCourseModule.isSelfGuided ? (
        <div className="flex items-center justify-center gap-4 p-4">
          <p className="text-sm text-muted-foreground">
            {isCurrentCms
              ? 'This step is self-guided. You can proceed to the next step by clicking next.'
              : 'This step is self-guided.'}
          </p>
          {isCurrentCms ? (
            <Button
              variant="outline"
              className="w-fit"
              onClick={advanceToNextCourseModule}
            >
              Next <ArrowRightIcon size={18} className="ml-2" />
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            'no-scrollbar flex grow flex-col gap-3 px-3 transition-all duration-300 md:h-full',
            messagesExpanded
              ? 'max-h-full overflow-scroll py-2'
              : 'max-h-0 overflow-hidden'
          )}
          ref={messagesRef}
          id="course-module-session-messages"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn('w-auto max-w-[92%] rounded-xl px-3 py-2', {
                'mr-auto rounded-bl-none bg-ring/20':
                  message.agent === 'assistant',
                'ml-auto rounded-br-none bg-stone-200':
                  message.agent === 'user',
              })}
            >
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xs font-bold">
                  {message.agent === 'assistant' ? 'Tutor' : 'You'}
                </p>
                <p className="text-xs text-muted-foreground/80">
                  {timeAgo(new Date(message.createdAt))}
                </p>
              </div>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
          {tutorResponseFetcher.state !== 'idle' && optimistic ? (
            <Loading />
          ) : null}
          {tutorResponseFetcher.data?.error ? (
            <p className="w-full rounded-lg border-destructive bg-destructive/5 p-3 text-destructive">
              {tutorResponseFetcher.data.error}
            </p>
          ) : null}
        </div>
      )}
      {cmsIdx !== 0 ? (
        <div
          className={cn(
            'flex flex-col items-center justify-center p-4',
            messagesExpanded && !cms.studentCourseModule.isSelfGuided
              ? 'border-t'
              : undefined
          )}
        >
          <div className="mb-4 text-center text-sm text-muted-foreground">
            {userIsAdmin || userIsTeacher ? (
              <>
                This step has been completed. Click next to continue <br />
                or
                <Button
                  variant="link"
                  onClick={handleReset}
                  className="h-4 pl-1 pr-0"
                >
                  reset back to this point
                </Button>
                .
              </>
            ) : (
              'This step has been completed. Click next to continue.'
            )}
          </div>
          <Button
            onClick={() =>
              navigate(`/app/documents/${docId}?cmsIdx=${nextCmsIdx}`)
            }
          >
            Next <ArrowRightIcon size={18} className="ml-2" />
          </Button>
        </div>
      ) : finishedCms && nextCmId ? (
        <div
          className={cn(
            'flex flex-col items-center gap-4 border-t p-2 px-4',
            messagesExpanded && !cms.studentCourseModule.isSelfGuided
              ? 'border-t'
              : undefined
          )}
        >
          <p className="text-center text-sm text-muted-foreground">
            This will take you to the next step of the writing process. Click
            next again only if you are ready to move on, or click back to stay
            on this step.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={decrementInstruction} variant="secondary">
              <ArrowLeftIcon size={18} className="mr-2" /> Back
            </Button>
            <Button onClick={advanceToNextCourseModule}>
              Next <ArrowRightIcon size={18} className="ml-2" />
            </Button>
          </div>
        </div>
      ) : finishedCms ? (
        <p
          className={cn(
            'p-2 text-center text-sm text-muted-foreground',
            messagesExpanded && !cms.studentCourseModule.isSelfGuided
              ? 'border-t'
              : undefined
          )}
        >
          You have completed all the modules in this course.
        </p>
      ) : (
        <ResponseBar
          className={
            messagesExpanded && !cms.studentCourseModule.isSelfGuided
              ? undefined
              : 'border-t-0'
          }
          buttons={instruction.buttons ?? []}
          respond={respond}
          showChatButton={!!instruction.showChatButton}
          showNextButton={!!instruction.showNextButton}
          advanceInstruction={
            isLastCmInstruction
              ? () => {
                  incrementInstruction();
                  advanceToNextCourseModule();
                }
              : incrementInstruction
          }
        />
      )}
      <Dialog
        open={showResetConfirmation}
        onOpenChange={setShowResetConfirmation}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Reset</DialogTitle>
            <DialogDescription>
              This action cannot be undone. It will permanently remove all
              progress in later steps. Are you sure you want to continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowResetConfirmation(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReset}
              isLoading={isLoading}
            >
              Reset Progress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
