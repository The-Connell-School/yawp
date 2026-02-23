import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';

export function SessionExpiryModal() {
  const [isExpired, setIsExpired] = useState(false);
  const location = useLocation();

  // Don't show on auth pages
  const isAuthPage = location.pathname.startsWith('/auth');

  useEffect(() => {
    if (isAuthPage) return;

    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();
        if (!data.valid) {
          setIsExpired(true);
        }
      } catch {
        // Network error - don't show modal, might just be offline
      }
    };

    // Check when page becomes visible (e.g., laptop opened, tab switched to)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    };

    // Check on mount
    checkSession();

    // Check when page becomes visible
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthPage]);

  if (isAuthPage || !isExpired) {
    return null;
  }

  const handleLogin = () => {
    const redirectTo = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = `/auth/login?redirectTo=${redirectTo}`;
  };

  return (
    <Dialog open={isExpired} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Session Expired</DialogTitle>
          <DialogDescription>
            Your session has expired. Please log in again to continue working.
            Don&apos;t worry, any unsaved changes in your document will be
            preserved once you log back in.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleLogin} className="w-full sm:w-auto">
            Log In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
