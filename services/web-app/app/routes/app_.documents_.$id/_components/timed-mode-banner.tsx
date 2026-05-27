import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, AlertTriangleIcon } from 'lucide-react';

type Props = {
  durationMinutes: number;
  onExpire?: () => void;
};

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function TimedModeBanner({ durationMinutes, onExpire }: Props) {
  const totalMs = durationMinutes * 60 * 1000;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [msRemaining, setMsRemaining] = useState(totalMs);
  const [expired, setExpired] = useState(false);
  const expiredRef = useRef(false);

  const start = useCallback(() => {
    if (!startedAt) setStartedAt(Date.now());
  }, [startedAt]);

  useEffect(() => {
    if (!startedAt) return;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, totalMs - elapsed);
      setMsRemaining(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        setExpired(true);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [startedAt, totalMs, onExpire]);

  const isWarning = msRemaining > 0 && msRemaining <= 5 * 60 * 1000;

  if (expired) {
    return (
      <div className="flex items-center justify-center gap-2 border-b bg-red-100 px-4 py-2 text-sm font-medium text-red-800">
        <AlertTriangleIcon className="h-4 w-4" />
        Time expired
      </div>
    );
  }

  if (!startedAt) {
    return (
      <div className="flex items-center justify-between border-b bg-blue-50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-blue-800">
          <Clock className="h-4 w-4" />
          Timed assignment — {durationMinutes} minutes
        </div>
        <button
          type="button"
          onClick={start}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          Start timer
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center gap-2 border-b px-4 py-1.5 text-sm font-medium tabular-nums ${
        isWarning
          ? 'bg-amber-100 text-amber-800'
          : 'bg-blue-50 text-blue-800'
      }`}
    >
      <Clock className="h-4 w-4" />
      {formatTime(msRemaining)} remaining
    </div>
  );
}
