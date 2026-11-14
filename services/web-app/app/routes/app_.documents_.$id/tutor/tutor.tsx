import { useLocation, useNavigate, useSearchParams } from 'react-router';
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
import {
  getAssignmentModuleIdForCmsIdx,
  getNextAssignmentModuleId,
  getPreviousAssignmentModuleId,
} from './assignment-module-navigation';
import { postTutorResponseWithFallbackRetry } from './tutor-response-retry';
import {
  captureAppErrorPresentedClient,
  captureAppRateLimitHitClient,
} from '~/utils/app-error-presented.client';
import { classifyTutorApiError } from '~/utils/app-error-presented.shared';

type Props = {
  className?: string;
  docId: string;
  nextCmId?: string;
  hasPreviousCms?: boolean;
  getCurrentDocumentText?: () => string | null;
  beforeRespond?: () => Promise<boolean>;
  isSessionLocked?: boolean;
  onCmsUpdate?: (cms: any) => void;
  cmsIdx?: number;
  /**
   * Route the module arrows navigate within. Defaults to the solo editor, which
   * is where this component has always lived; a shared draft passes its own so
   * stepping to the next module does not walk the student out of the group.
   */
  basePath?: string;
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
  className,
  cms,
  nextCmId,
  docId,
  hasPreviousCms,
  getCurrentDocumentText,
  beforeRespond,
  isSessionLocked = false,
  onCmsUpdate,
  cmsIdx: resolvedCmsIdx,
  basePath = '/app/documents',
}: Props) => {
  const [messagesExpanded, setMessagesExpanded] = useLocalStorage(
    `doc-${docId}-tutor-messages-expanded`,
    true
  );
  const [isTutorResponding, setIsTutorResponding] = useState(false);
  const [isTutorRetrying, setIsTutorRetrying] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<{
    agent: string;
    createdAt: Date;
    content: string;
  } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlCmsIdx = parseInt(searchParams.get('cmsIdx') ?? '0') || 0;
  const cmsIdx = resolvedCmsIdx ?? urlCmsIdx;

  const finishedCms =
    cms.instructionsCompleted === cms.assignmentModule.instructions.length;
  const isLastCmInstruction =
    cms.instructionsCompleted === cms.assignmentModule.instructions.length - 1;

  const instruction =
    cms.assignmentModule.instructions[cms.instructionsCompleted] ?? {};

  const livePreviousModuleId = useMemo(
    () => getPreviousAssignmentModuleId(cms),
    [cms]
  );
  const prevCmsIdx =
    hasPreviousCms && livePreviousModuleId ? cmsIdx - 1 : undefined;
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
      navigate(`${basePath}/${docId}${query ? `?${query}` : ''}`, {
        replace: true,
      });
    },
    [basePath, docId, navigate, searchParams]
  );

  const activateCmsIdx = useCallback(
    async (nextIdx: number | undefined) => {
      if (nextIdx === undefined) {
        navigateToCmsIdx(nextIdx);
        return;
      }

      const targetIdx = Math.max(0, nextIdx);
      const targetModuleId = getAssignmentModuleIdForCmsIdx(cms, targetIdx);

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
    [cms, docId, navigateToCmsIdx, onCmsUpdate]
  );

  const respond = useCallback(
    async (response: string) => {
      if (isSessionLocked) return;
      if (beforeRespond) {
        const canProceed = await beforeRespond();
        if (!canProceed) return;
      }
      setTutorError(null);
      setIsTutorRetrying(false);
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
        const { response: res, json } =
          await postTutorResponseWithFallbackRetry({
            formData,
            onRetry: () => setIsTutorRetrying(true),
          });
        if (!res.ok || json.error) {
          const message =
            typeof json.error === 'string'
              ? json.error
              : (json.error?.message ?? json.message ?? 'An error occurred.');
          setTutorError(message);
          const classified = classifyTutorApiError({
            status: res.status,
            message: json.message,
            error: json.error,
          });
          captureAppErrorPresentedClient({
            severity: classified.severity,
            surface: 'banner',
            error_code: classified.error_code,
            http_status: classified.http_status,
            message_template: classified.message_template,
            route_template: location.pathname,
            is_expected: classified.is_expected,
            product_area: 'tutor',
          });
          if (classified.rate_limit) {
            captureAppRateLimitHitClient({
              feature: classified.rate_limit.feature,
              scope: classified.rate_limit.scope,
              limit_window: classified.rate_limit.limit_window,
              route_template: location.pathname,
            });
          }
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
        const message =
          'Failed to get a response from the tutor. Please try again.';
        setTutorError(message);
        captureAppErrorPresentedClient({
          severity: 'user_blocking',
          surface: 'banner',
          error_code: 'TUTOR_FAILED',
          http_status: null,
          message_template: message,
          route_template: location.pathname,
          is_expected: false,
          product_area: 'tutor',
        });
        setOptimisticMessage(null);
      } finally {
        setIsTutorResponding(false);
        setIsTutorRetrying(false);
      }
    },
    [
      isSessionLocked,
      beforeRespond,
      cms.id,
      getCurrentDocumentText,
      location.pathname,
      onCmsUpdate,
    ]
  );

  const instructionStepNumber = cms.instructionsCompleted + 1;
  const instructionStepTotal = cms.assignmentModule.instructions.length;

  const setInstructionStep = useCallback(
    async (index: number) => {
      if (isSessionLocked) return;
      const next = Math.max(
        0,
        Math.min(index, cms.assignmentModule.instructions.length)
      );
      if (next === cms.instructionsCompleted) return;
      const formData = new FormData();
      formData.append('instructionsCompleted', String(next));
      try {
        const res = await fetch(
          `/api/model/assignment-module-session/${cms.id}`,
          { method: 'POST', body: formData }
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.cms) onCmsUpdate?.(json.cms);
        }
      } catch {
        // user can retry
      }
    },
    [isSessionLocked, cms.id, cms.instructionsCompleted, cms.assignmentModule.instructions.length, onCmsUpdate]
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
    <div
      data-tour="doc-tutor"
      className={cn('doc-editor-tutor flex w-full flex-col pb-2', className)}
    >
      <div
        className="doc-editor-tutor-header"
        data-testid="tutor-module-header"
      >
        <img
          src="/img/landing/yawp-logo-circle.jpg"
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 shrink-0 rounded-full"
        />
        <b className="text-sm text-[#0f172a]">Tutor</b>
        <span className="ml-auto inline-flex items-center gap-1">
          <Tooltip text="Previous step" delayDuration={0}>
            <button
              type="button"
              className="doc-editor-tutor-step-btn"
              aria-label="Previous step"
              data-testid="tutor-previous-instruction"
              disabled={isSessionLocked || cms.instructionsCompleted <= 0}
              onClick={() => void setInstructionStep(cms.instructionsCompleted - 1)}
            >
              <ChevronLeftIcon size={14} />
            </button>
          </Tooltip>
          <span
            className="px-1 text-xs text-[hsl(50_2.4%_36%)]"
            data-testid="tutor-step-indicator"
          >
            Step {instructionStepNumber} of {instructionStepTotal}
          </span>
          <Tooltip text="Next step" delayDuration={0}>
            <button
              type="button"
              className="doc-editor-tutor-step-btn"
              aria-label="Next step"
              data-testid="tutor-next-instruction"
              disabled={
                isSessionLocked ||
                cms.instructionsCompleted >= instructionStepTotal - 1
              }
              onClick={() => void setInstructionStep(cms.instructionsCompleted + 1)}
            >
              <ChevronRightIcon size={14} />
            </button>
          </Tooltip>
        </span>
        {cms.assignmentModule.isSelfGuided ? null : (
          <Tooltip
            text={messagesExpanded ? 'Hide messages' : 'Show messages'}
            delayDuration={0}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className="min-w-8 shrink-0"
              aria-label={
                messagesExpanded ? 'Hide tutor messages' : 'Show tutor messages'
              }
              disabled={isSessionLocked}
              onClick={() => setMessagesExpanded(!messagesExpanded)}
            >
              {messagesExpanded ? (
                <MessageSquareOff size={18} />
              ) : (
                <MessageSquareText size={18} />
              )}
            </Button>
          </Tooltip>
        )}
      </div>
      {!cms.assignmentModule.isSelfGuided ? (
        <div className="doc-editor-tutor-instruction-title" data-testid="tutor-instruction-title">
          <b>{instruction.title?.trim() || cms.assignmentModule.title}</b>
        </div>
      ) : (
        <div className="doc-editor-tutor-instruction-title" data-testid="tutor-module-title">
          <b>{cms.assignmentModule.title}</b>
        </div>
      )}
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
              className={cn({
                'doc-editor-tutor-message mr-auto w-auto max-w-[92%]':
                  message.agent === 'assistant',
                'doc-editor-tutor-student ml-auto': message.agent === 'user',
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
            <Loading label={isTutorRetrying ? 'Retrying...' : undefined} />
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
          locked={isSessionLocked}
          defaultOpen={cms.messages.some((message) => message.agent === 'user')}
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
