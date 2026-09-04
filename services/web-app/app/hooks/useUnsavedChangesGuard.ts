import { useState } from 'react';

/**
 * Gates a close action behind a confirmation whenever there are unsaved
 * changes. Callers wire `requestClose` to whatever normally closes the
 * surface (a Sheet's `onOpenChange(false)`, a Dialog's close button, a
 * router navigation) instead of calling that close directly. When nothing
 * is dirty the close happens immediately, same as before this existed.
 *
 * Generic across any "editing surface with a close action" — sheets, dialogs,
 * drawers — so it is not named after Sheets specifically.
 */
export function useUnsavedChangesGuard({
  isDirty,
  onClose,
}: {
  isDirty: boolean;
  onClose: () => void;
}) {
  const [guardOpen, setGuardOpen] = useState(false);

  function requestClose() {
    if (isDirty) {
      setGuardOpen(true);
    } else {
      onClose();
    }
  }

  function confirmDiscard() {
    setGuardOpen(false);
    onClose();
  }

  function cancelDiscard() {
    setGuardOpen(false);
  }

  return { guardOpen, requestClose, confirmDiscard, cancelDiscard };
}
