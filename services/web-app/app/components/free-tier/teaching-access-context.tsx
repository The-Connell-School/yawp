import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFetchers, useFetcher } from 'react-router';
import { toast } from 'sonner';
import type { TeachingAccessShellState } from '~/domain/free-tier/teaching-access-shell.server';
import { ApprovalRequiredToast } from './teaching-access-toasts';
import {
  TEACHING_ACCESS_APPROVAL_TOAST_BODY,
  TEACHING_ACCESS_APPROVAL_TOAST_TITLE,
} from '~/domain/free-tier/teaching-access-copy';
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
  const approvalToastShownRef = useRef(false);
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

  // The "you're approved" note is a standard app toast (Sonner, default
  // duration). It is marked seen as soon as it shows so it appears once.
  useEffect(() => {
    if (approvalToastShownRef.current) return;
    if (state.variant !== 'unlocked' || !state.showApprovalToast) return;
    approvalToastShownRef.current = true;
    // Deferred like the root Toaster's own server toasts: this effect runs
    // before the root <Toaster> subscribes, and Sonner drops toasts sent
    // before then.
    setTimeout(() => {
      toast.success(TEACHING_ACCESS_APPROVAL_TOAST_TITLE, {
        id: 'teaching-access-approval',
        description: TEACHING_ACCESS_APPROVAL_TOAST_BODY,
        testId: 'teaching-access-approval-toast',
      });
    }, 0);
    dismissFetcher.submit(null, {
      method: 'POST',
      action: '/app/teaching-access/dismiss-approval-toast',
    });
  }, [dismissFetcher, state]);

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
    </TeachingAccessContext.Provider>
  );
}
