import { useEffect } from 'react';
import { markInternalCopy } from '~/utils/internal-copy';

/**
 * Records that the most recent copy/cut happened inside YAWP.
 *
 * Mounted once by the root layout so the listeners are live on every page,
 * not just while a document editor is open. The root — not the /app layout
 * — because the document editor route (`app_.documents_.$id`) opts out of
 * that layout. Without that reach, a student who copies on the class page
 * or an assignment prompt and then pastes into an editor looks like an
 * external paste and gets a false alarm.
 */
export function useInternalCopyMarker() {
  useEffect(() => {
    // A per-instance closure rather than the shared function reference, so
    // that a nested mount/unmount removes only its own listener and can't
    // tear down the layout's.
    //
    // The selection is read here rather than from event.clipboardData,
    // which is write-only during a copy. Surfaces that keep their selection
    // out of window.getSelection() (inputs, textareas) yield an empty
    // string, which markInternalCopy records as "copied, text unknown".
    const handleCopyOrCut = () =>
      markInternalCopy(window.getSelection()?.toString() ?? '');

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
