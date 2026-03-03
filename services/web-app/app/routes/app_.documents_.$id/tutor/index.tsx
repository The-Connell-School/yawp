import { useFetcher, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageSquareOff,
  MessageSquareText,
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
import { Tooltip } from '~/components/ui/tooltip';
import { useAsyncFetcherSubmit } from '~/hooks/useAsyncFetcher.ts';
import { useUser } from '~/hooks/useUser';
import { cn } from '~/utils/misc';
import { timeAgo } from '~/utils/timeAgo/timeAgo';
import { Loading } from './loading';
import { ResponseBar } from './response-bar';

type Props = {
  docId: string;
  nextCmId?: string;
  hasPreviousCms?: boolean;
  getCurrentDocumentText?: () => string | null;
  beforeRespond?: () => Promise<boolean>;
  isSessionLocked?: boolean;
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

export const Tutor = ({
  cms,
  nextCmId,
  docId,
  hasPreviousCms,
  getCurrentDocumentText,
  beforeRespond,
  isSessionLocked = false,
}: Props) => {
  const [messagesExpanded, setMessagesExpanded] = useLocalStorage(
    `doc-${docId}-tutor-messages-expanded`,
    true
  );
  const [showResetConfirmation, setShowResetConfirmation] = useLocalStorage(
    `doc-${docId}-reset-confirmation`,
    false
  );
  const tutorResponseFetcher = useFetcher<{ error?: string }>();
  const incrementInstructionFetcher = useFetcher();
  const advanceCourseModuleFetcher = useFetcher();
  const messagesRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;

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
  const navigateToCmsIdx = (nextIdx: number | undefined) => {
    const params = new URLSearchParams(searchParams);
    if (nextIdx === undefined || nextIdx === 0) {
      params.delete('cmsIdx');
    } else {
      params.set('cmsIdx', String(nextIdx));
    }
    const query = params.toString();
    navigate(`/app/documents/${docId}${query ? `?${query}` : ''}`, {
      replace: true,
    });
  };

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

  const respond = async (response: string) => {
    if (isSessionLocked) return;
    if (beforeRespond) {
      const canProceed = await beforeRespond();
      if (!canProceed) return;
    }
    tutorResponseFetcher.submit(
      {
        response,
        cmsId: cms.id,
        content: getCurrentDocumentText?.() ?? '',
      },
      { method: 'POST', action: '/api/domain/tutor-response' }
    );
  };

  const incrementInstruction = (label?: string) => {
    if (isSessionLocked) return;
    incrementInstructionFetcher.submit(
      {
        'instructionsCompleted.increment': 1,
        ...(label ? { incrementButtonText: label } : {}),
      },
      {
        method: 'POST',
        action: `/api/model/course-module-session/${cms.id}`,
      }
    );
  };

  const decrementInstruction = () => {
    if (isSessionLocked) return;
    incrementInstructionFetcher.submit(
      { 'instructionsCompleted.decrement': 1 },
      {
        method: 'POST',
        action: `/api/model/course-module-session/${cms.id}`,
      }
    );
  };

  const advanceToNextCourseModule = () => {
    if (isSessionLocked) return;
    advanceCourseModuleFetcher.submit(
      { studentCourseModuleId: nextCmId ?? '', documentId: docId },
      {
        method: 'POST',
        action: '/api/model/course-module-session',
      }
    );
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
    if (!searchParams.has('spa')) return;

    const next = new URLSearchParams(searchParams);
    next.delete('spa');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleReset = () => {
    if (isSessionLocked) return;
    setShowResetConfirmation(true);
  };

  const confirmReset = async () => {
    if (isSessionLocked) return;
    await submit(
      { cmsId: cms.id },
      {
        method: 'POST',
        action: '/api/domain/delete-subsequent-cms',
      }
    );
    setShowResetConfirmation(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('cmsIdx');
        return next;
      },
      { replace: true }
    );
  };

  return (
    <div className="flex w-full flex-col border-r bg-muted/30 pb-2 md:w-3/5">
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
                  !isSessionLocked &&
                  prevCmsIdx !== undefined &&
                  navigateToCmsIdx(prevCmsIdx)
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
                  !isSessionLocked &&
                  nextCmsIdx !== undefined &&
                  navigateToCmsIdx(nextCmsIdx)
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
                disabled={isSessionLocked}
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
              disabled={isSessionLocked}
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
              <p
                className="whitespace-pre-wrap"
                data-tutor-message={
                  message.agent === 'assistant' ? 'true' : undefined
                }
              >
                {message.content}
              </p>
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
            This step has been completed. Click next to continue <br />
            or
            <Button
              disabled={isSessionLocked}
              variant="link"
              onClick={handleReset}
              className="h-4 pl-1 pr-0"
            >
              reset back to this point
            </Button>
            .
          </div>
          <Button
            disabled={isSessionLocked}
            onClick={() => navigateToCmsIdx(nextCmsIdx)}
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
          disabled={isSessionLocked}
          advanceInstruction={
            isLastCmInstruction
              ? (label?: string) => {
                  incrementInstruction(label);
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
