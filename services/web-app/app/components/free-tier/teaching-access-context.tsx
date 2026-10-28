import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFetchers, useFetcher } from 'react-router';
import type { TeachingAccessShellState } from '~/domain/free-tier/teaching-access-shell.server';
import {
  ApprovalRequiredToast,
  ApprovalSuccessToast,
} from './teaching-access-toasts';
import useBreakpoint from '~/hooks/useBreakpoint';

type TeachingAccessContextValue = {
  state: TeachingAccessShellState;
  locked: boolean;
  loading: boolean;
};

const TeachingAccessContext = createContext<TeachingAccessContextValue>({
  state: { variant: 'none' },
  locked: false,
  loading: false,
});

export function useTeachingAccess() {
  return useContext(TeachingAccessContext);
}

function isApprovalRequiredPayload(data: unknown) {
  return (
    !!data &&
    typeof data === 'object' &&
    'error' in data &&
    (data as { error?: string }).error === 'approval_required'
  );
}

export function TeachingAccessProvider({
  state,
  children,
}: {
  state: TeachingAccessShellState;
  children: ReactNode;
}) {
  const fetchers = useFetchers();
  const dismissFetcher = useFetcher();
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [approvalToastOpen, setApprovalToastOpen] = useState(
    state.variant === 'unlocked' && state.showApprovalToast
  );
  const approvalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approvalPausedRef = useRef(false);
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'base' || breakpoint === 'sm';
  const loading = state.variant === 'loading';
  const locked = state.variant === 'locked' || loading;

  useEffect(() => {
    for (const fetcher of fetchers) {
      if (isApprovalRequiredPayload(fetcher.data)) {
        setErrorToastOpen(true);
      }
    }
  }, [fetchers]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const patchedFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const response = await originalFetch(input, init);
      if (response.status === 403) {
        try {
          const data = await response.clone().json();
          if (isApprovalRequiredPayload(data)) {
            setErrorToastOpen(true);
          }
        } catch {
          setErrorToastOpen(true);
        }
      }
      return response;
    };
    window.fetch = Object.assign(patchedFetch, originalFetch);
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const dismissApprovalToast = useCallback(() => {
    setApprovalToastOpen(false);
    if (state.variant === 'unlocked') {
      dismissFetcher.submit(null, {
        method: 'POST',
        action: '/app/teaching-access/dismiss-approval-toast',
      });
    }
  }, [dismissFetcher, state]);

  useEffect(() => {
    if (
      approvalToastOpen &&
      state.variant === 'unlocked' &&
      state.showApprovalToast
    ) {
      dismissFetcher.submit(null, {
        method: 'POST',
        action: '/app/teaching-access/dismiss-approval-toast',
      });
    }
  }, [approvalToastOpen, dismissFetcher, state]);

  useEffect(() => {
    if (!approvalToastOpen) return;
    if (approvalPausedRef.current) return;
    approvalTimerRef.current = setTimeout(() => {
      dismissApprovalToast();
    }, 8000);
    return () => {
      if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current);
    };
  }, [approvalToastOpen, dismissApprovalToast]);

  const value = useMemo(
    () => ({ state, locked, loading }),
    [state, locked, loading]
  );

  return (
    <TeachingAccessContext.Provider value={value}>
      <div id="teaching-access-live" className="sr-only" aria-live="polite" />
      {children}
      {errorToastOpen ? (
        <ApprovalRequiredToast
          mobilePinned={isMobile}
          onDismiss={() => setErrorToastOpen(false)}
        />
      ) : null}
      {approvalToastOpen ? (
        <div
          onMouseEnter={() => {
            approvalPausedRef.current = true;
            if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current);
          }}
          onMouseLeave={() => {
            approvalPausedRef.current = false;
            approvalTimerRef.current = setTimeout(
              () => dismissApprovalToast(),
              8000
            );
          }}
          onFocusCapture={() => {
            approvalPausedRef.current = true;
            if (approvalTimerRef.current) clearTimeout(approvalTimerRef.current);
          }}
          onBlurCapture={() => {
            approvalPausedRef.current = false;
            if (approvalToastOpen) {
              approvalTimerRef.current = setTimeout(
                () => dismissApprovalToast(),
                8000
              );
            }
          }}
        >
          <ApprovalSuccessToast
            className={
              isMobile ? 'left-3 right-3 top-[calc(3.5rem+0.5rem)]' : undefined
            }
            onDismiss={dismissApprovalToast}
          />
        </div>
      ) : null}
    </TeachingAccessContext.Provider>
  );
}
