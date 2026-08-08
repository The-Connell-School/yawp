import { useEffect } from 'react';
import { markInternalCopy } from '~/utils/internal-copy';

/**
 * Records that the most recent copy/cut happened inside YAWP.
 *
 * Mounted once by the /app layout so the listeners are live on every
 * authenticated page, not just while a document editor is open. Without
 * that reach, a student who copies on the class page or an assignment
 * prompt and then pastes into an editor looks like an external paste and
 * gets a false alarm.
 */
export function useInternalCopyMarker() {
  useEffect(() => {
    // A per-instance closure rather than the shared function reference, so
    // that a nested mount/unmount removes only its own listener and can't
    // tear down the layout's.
    const handleCopyOrCut = () => markInternalCopy();

    document.addEventListener('copy', handleCopyOrCut);
    document.addEventListener('cut', handleCopyOrCut);

    return () => {
      document.removeEventListener('copy', handleCopyOrCut);
      document.removeEventListener('cut', handleCopyOrCut);
      // Deliberately not clearing the flag — it's app-wide, not scoped to
      // this hook's lifetime.
    };
  }, []);
}
