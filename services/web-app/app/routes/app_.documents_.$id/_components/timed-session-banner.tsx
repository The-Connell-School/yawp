import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '~/utils/misc';

type TimedSessionData = {
  id: string;
  phase: string;
  startedAt: string | Date;
  durationMinutes: number;
  submittedAt: string | Date | null;
  autoSubmitted: boolean;
};

type Props = {
  timedSession: TimedSessionData;
  documentId: string;
  editorBridgeRef: React.RefObject<{
    getContent: () => { html: string; text: string };
    saveNow: (opts: { source: string }) => Promise<void>;
  } | null>;
};

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getSecondsRemaining(
  startedAt: string | Date,
  durationMinutes: number
): number {
  const start = new Date(startedAt).getTime();
  const end = start + durationMinutes * 60 * 1000;
  const now = Date.now();
  return Math.max(0, Math.floor((end - now) / 1000));
}

export function TimedSessionBanner({
  timedSession,
  documentId,
  editorBridgeRef,
}: Props) {
  const fetcher = useFetcher();
  const hasAutoSubmitted = useRef(false);

  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    getSecondsRemaining(timedSession.startedAt, timedSession.durationMinutes)
  );

  const isExpired = secondsRemaining <= 0;
  const isWarning = secondsRemaining <= 300 && secondsRemaining > 0;

  const handleAutoSubmit = useCallback(async () => {
    if (hasAutoSubmitted.current) return;
    hasAutoSubmitted.current = true;

    await editorBridgeRef.current?.saveNow({ source: 'timed-auto-submit' });

    const content = editorBridgeRef.current?.getContent();
    const fd = new FormData();
    fd.set('intent', 'timed-auto-submit');
    fd.set('timedSessionId', timedSession.id);
    if (content?.text) fd.set('title', 'Timed submission');
    fetcher.submit(fd, {
      method: 'POST',
      action: `/api/domain/submit-document?documentId=${documentId}`,
    });
  }, [documentId, editorBridgeRef, fetcher, timedSession.id]);

  useEffect(() => {
    if (timedSession.submittedAt) return;

    const interval = setInterval(() => {
      const remaining = getSecondsRemaining(
        timedSession.startedAt,
        timedSession.durationMinutes
      );
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        void handleAutoSubmit();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    timedSession.startedAt,
    timedSession.durationMinutes,
    timedSession.submittedAt,
    handleAutoSubmit,
  ]);

  if (timedSession.submittedAt) {
    return (
      <div
        data-testid="timed-session-banner"
        className="mx-auto flex w-full max-w-screen-2xl items-center gap-2 border-b bg-muted px-3 py-2 text-sm text-muted-foreground"
      >
        <Clock className="h-4 w-4" />
        <span>Time expired — essay submitted.</span>
      </div>
    );
  }

  return (
    <div
      data-testid="timed-session-banner"
      className={cn(
        'mx-auto flex w-full max-w-screen-2xl items-center gap-2 border-b px-3 py-2 text-sm font-medium',
        isExpired && 'bg-red-50 text-red-700',
        isWarning && !isExpired && 'bg-amber-50 text-amber-700',
        !isWarning && !isExpired && 'bg-blue-50 text-blue-700'
      )}
    >
      {isWarning ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Clock className="h-4 w-4" />
      )}
      <span>Timed writing session</span>
      <span className="tabular-nums">{formatTime(secondsRemaining)}</span>
      <span className="text-xs font-normal opacity-70">remaining</span>
    </div>
  );
}
