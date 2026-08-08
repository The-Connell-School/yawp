import { useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageSquareOff,
  MessageSquareText,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { Button } from '~/components/ui/button';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';
import { timeAgo } from '~/utils/timeAgo/timeAgo';
import { Loading } from './loading';
import { ResponseBar } from './response-bar';
import { compareTutorMessagesByTimeThenId } from './tutor-message-sort';
import { getNextAssignmentModuleId } from './assignment-module-navigation';
import { postTutorResponse } from './tutor-response-retry';

type Props = {
  docId: string;
  nextCmId?: string;
  hasPreviousCms?: boolean;
  getCurrentDocumentText?: () => string | null;
  beforeRespond?: () => Promise<boolean>;
  isSessionLocked?: boolean;
  onCmsUpdate?: (cms: any) => void;
  cmsIdx?: number;
  cms: {
    assignmentModuleId?: string;
    assignmentModule: {
      id?: string;
      assignmentType: {
        assignmentModules: { id: string; position: number }[];
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
  onCmsUpdate,
  cmsIdx: resolvedCmsIdx,
}: Props) => {
  const [messagesExpanded, setMessagesExpanded] = useLocalStorage(
    `doc-${docId}-tutor-messages-expanded`,
    true
  );
  const [isTutorResponding, setIsTutorResponding] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<{
    agent: string;
    createdAt: Date;
    content: string;
  } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;
  const cmsIdx = resolvedCmsIdx ?? urlCmsIdx;

  const finishedCms =
    cms.instructionsCompleted === cms.assignmentModule.instructions.length;
  const isLastCmInstruction =
    cms.instructionsCompleted === cms.assignmentModule.instructions.length - 1;

  const instruction =
    cms.assignmentModule.instructions[cms.instructionsCompleted] ?? {};

  const prevCmsIdx = hasPreviousCms ? cmsIdx - 1 : undefined;
  const liveNextModuleId = useMemo(
    () => getNextAssignmentModuleId(cms, nextCmId),
    [cms, nextCmId]
  );

  const navigateToCmsIdx = useCallback(
    (nextIdx: number | undefined) => {
      const params = new URLSearchParams(searchParams);
      if (nextIdx === undefined) {
        params.delete('cmsIdx');
      } else {
        params.set('cmsIdx', String(Math.max(0, nextIdx)));
      }
      const query = params.toString();
      navigate(`/app/documents/${docId}${query ? `?${query}` : ''}`, {
        replace: true,
      });
    },
    [docId, navigate, searchParams]
  );

  const activateCmsIdx = useCallback(
    async (nextIdx: number | undefined) => {
      if (nextIdx === undefined) {
        navigateToCmsIdx(nextIdx);
        return;
      }

      const targetIdx = Math.max(0, nextIdx);
      const targetModuleId =
        cms.assignmentModule.assignmentType?.assignmentModules[targetIdx]?.id;

      if (targetModuleId) {
        const formData = new FormData();
        formData.append('assignmentModuleId', targetModuleId);
        formData.append('documentId', docId);

        try {
          const res = await fetch('/api/model/assignment-module-session', {
            method: 'POST',
            body: formData,
          });
          if (res.ok) {
            const json = await res.json();
            if (json?.cms) {
              onCmsUpdate?.(json.cms);
            }
          }
        } catch {
          // Keep explicit URL navigation available if the recency write fails.
        }
      }

      navigateToCmsIdx(targetIdx);
    },
    [
      cms.assignmentModule.assignmentType?.assignmentModules,
      docId,
      navigateToCmsIdx,
      onCmsUpdate,
    ]
  );

  const respond = useCallback(
    async (response: string) => {
      if (isSessionLocked) return;
      if (beforeRespond) {
        const canProceed = await beforeRespond();
        if (!canProceed) return;
      }
      setTutorError(null);
      setOptimisticMessage({
        agent: 'user',
        createdAt: new Date(),
        content: response,
      });
      setIsTutorResponding(true);
      try {
        const formData = new FormData();
        formData.append('response', response);
        formData.append('cmsId', cms.id);
        formData.append('content', getCurrentDocumentText?.() ?? '');
        const { response: res, json } = await postTutorResponse({
          formData,
        });
        if (!res.ok || json.error) {
          setTutorError(json.error ?? 'An error occurred.');
          setOptimisticMessage(null);
        } else {
          setOptimisticMessage(null);
          setIsTutorResponding(false);
          if (json?.cms) {
            onCmsUpdate?.(json.cms);
          }
          return;
        }
      } catch {
        setTutorError(
          'Failed to get a response from the tutor. Please try again.'
        );
        setOptimisticMessage(null);
      } finally {
        setIsTutorResponding(false);
      }
    },
    [
      isSessionLocked,
      beforeRespond,
      cms.id,
      getCurrentDocumentText,
      onCmsUpdate,
    ]
  );

  const incrementInstruction = useCallback(
    async (label?: string) => {
      if (isSessionLocked) return;
      const formData = new FormData();
      formData.append('instructionsCompleted.increment', '1');
      if (label) formData.append('incrementButtonText', label);
      try {
        const res = await fetch(
          `/api/model/assignment-module-session/${cms.id}`,
          {
            method: 'POST',
            body: formData,
          }
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.cms) {
            onCmsUpdate?.(json.cms);
          }
        }
      } catch {
        // Silently fail — user can retry
      }
    },
    [isSessionLocked, cms.id, onCmsUpdate]
  );

  const advanceToNextCourseModule = useCallback(async () => {
    if (isSessionLocked || !liveNextModuleId) return;
    const formData = new FormData();
    formData.append('assignmentModuleId', liveNextModuleId);
    formData.append('documentId', docId);
    try {
      const res = await fetch('/api/model/assignment-module-session', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.cms) {
          onCmsUpdate?.(json.cms);
          navigateToCmsIdx(cmsIdx + 1);
        }
      }
    } catch {
      // Silently fail — user can retry
    }
  }, [
    isSessionLocked,
    liveNextModuleId,
    docId,
    onCmsUpdate,
    cmsIdx,
    navigateToCmsIdx,
  ]);

  const messages = useMemo(() => {
    const base = cms.messages.filter((m) =>
      ['user', 'assistant'].includes(m.agent)
    );
    base.sort(compareTutorMessagesByTimeThenId);
    return optimisticMessage ? base.concat([optimisticMessage as any]) : base;
  }, [cms.messages, optimisticMessage]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);

  return (
    <div className="flex w-full flex-col border-r bg-muted/30 pb-2 md:w-3/5">
      <div
        className={cn(
          'flex items-center justify-between gap-8 py-1 pl-4 pr-2',
          cms.assignmentModule.isSelfGuided ? '' : 'border-b'
        )}
        data-testid="tutor-module-header"
      >
        <div className="flex h-[32px] w-full items-center gap-1">
          <div className="flex flex-grow items-center gap-2">
            <Tooltip text="Previous step" delayDuration={0}>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Previous tutor step"
                data-testid="tutor-previous-module"
                disabled={prevCmsIdx === undefined}
                onClick={() =>
                  !isSessionLocked &&
                  prevCmsIdx !== undefined &&
                  void activateCmsIdx(prevCmsIdx)
                }
              >
                <ChevronLeftIcon size={20} />
              </Button>
            </Tooltip>
            <p className="text-sm font-bold text-foreground/80">
              {cms.assignmentModule.title}
            </p>
            <Tooltip text="Next step" delayDuration={0}>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Next tutor step"
                data-testid="tutor-next-module"
                disabled={!liveNextModuleId || isSessionLocked}
                onClick={advanceToNextCourseModule}
              >
                <ChevronRightIcon size={20} />
              </Button>
            </Tooltip>
          </div>
          {cms.assignmentModule.isSelfGuided ? null : (
            <Tooltip
              text={messagesExpanded ? 'Hide messages' : 'Show messages'}
              delayDuration={0}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                className="min-w-8"
                aria-label={messagesExpanded ? 'Hide tutor messages' : 'Show tutor messages'}
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
      {cms.assignmentModule.isSelfGuided ? (
        <div className="flex items-center justify-center gap-4 p-4">
          <p className="text-sm text-muted-foreground">
            This step is self-guided.
          </p>
          {liveNextModuleId ? (
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
          id="assignment-module-session-messages"
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
                dangerouslySetInnerHTML={{
                  __html: message.content
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>'),
                }}
              />
            </div>
          ))}
          {isTutorResponding && optimisticMessage ? (
            <Loading />
          ) : null}
          {tutorError ? (
            <p className="w-full rounded-lg border-destructive bg-destructive/5 p-3 text-destructive">
              {tutorError}
            </p>
          ) : null}
        </div>
      )}
      {finishedCms && liveNextModuleId ? (
        <div
          className={cn(
            'flex items-center justify-end gap-2 border-t p-2 px-4',
            messagesExpanded && !cms.assignmentModule.isSelfGuided
              ? 'border-t'
              : undefined
          )}
        >
          {hasPreviousCms ? (
            <Button
              onClick={() => void activateCmsIdx(prevCmsIdx)}
              variant="secondary"
            >
              <ArrowLeftIcon size={18} className="mr-2" /> Back
            </Button>
          ) : null}
          <Button onClick={advanceToNextCourseModule}>
            Next <ArrowRightIcon size={18} className="ml-2" />
          </Button>
        </div>
      ) : finishedCms ? (
        <p
          className={cn(
            'p-2 text-center text-sm text-muted-foreground',
            messagesExpanded && !cms.assignmentModule.isSelfGuided
              ? 'border-t'
              : undefined
          )}
        >
          You have completed all the modules in this course.
        </p>
      ) : (
        <ResponseBar
          className={
            messagesExpanded && !cms.assignmentModule.isSelfGuided
              ? undefined
              : 'border-t-0'
          }
          buttons={instruction.buttons ?? []}
          respond={respond}
          showChatButton={!!instruction.showChatButton}
          showNextButton={!!instruction.showNextButton}
          disabled={isSessionLocked || isTutorResponding}
          advanceInstruction={
            isLastCmInstruction && liveNextModuleId
              ? () => advanceToNextCourseModule()
              : incrementInstruction
          }
        />
      )}
    </div>
  );
};
