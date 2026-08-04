import { useCallback, useEffect, useState } from 'react';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

type Options = {
  documentId: string;
  isEditable: boolean;
  onLockTriggered?: () => void;
};

/**
 * Encapsulates the auth session monitoring for the document editor:
 * - Initial auth check on mount
 * - Re-check on focus / visibility change
 * - Periodic 5-min heartbeat
 * - Lock the session if any check returns invalid
 *
 * The route uses `isLocked` to disable the editor and the tutor.
 * On documentId change, the lock state is reset.
 */
export function useAuthHeartbeat({
  documentId,
  isEditable,
  onLockTriggered,
}: Options) {
  const [isLocked, setIsLocked] = useState(false);
  const [isInitialCheckComplete, setIsInitialCheckComplete] = useState(false);

  const lockSession = useCallback(() => {
    setIsLocked(true);
    onLockTriggered?.();
  }, [onLockTriggered]);

  const checkAuthSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/check', { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          lockSession();
          return false;
        }
        return true;
      }
      const data = (await response.json()) as { valid?: boolean };
      if (!data?.valid) {
        lockSession();
        return false;
      }
      return true;
    } catch {
      // Transient network error — don't lock the session
      return true;
    }
  }, [lockSession]);

  // Reset lock when documentId changes (e.g., navigated to a different doc)
  useEffect(() => {
    setIsLocked(false);
  }, [documentId]);

  // Initial auth check + focus/visibility re-check listeners
  useEffect(() => {
    if (!isEditable) {
      setIsInitialCheckComplete(true);
      return;
    }
    let cancelled = false;
    setIsInitialCheckComplete(false);

    const runInitialCheck = async () => {
      await checkAuthSession();
      if (!cancelled) setIsInitialCheckComplete(true);
    };

    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      void checkAuthSession();
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void checkAuthSession();
    };

    void runInitialCheck();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkAuthSession, documentId, isEditable]);

  // Periodic 5-min heartbeat
  useEffect(() => {
    if (!isEditable) return;
    const interval = setInterval(() => {
      void checkAuthSession();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isEditable, checkAuthSession]);

  return {
    isLocked,
    isInitialCheckComplete,
    checkAuthSession,
  };
}
