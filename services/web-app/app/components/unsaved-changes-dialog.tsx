import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';

/**
 * Pairs with `useUnsavedChangesGuard`: renders the confirmation itself. Kept
 * separate from the hook so any editing surface can supply its own wording
 * later without re-deriving the open/confirm/cancel wiring.
 */
export function UnsavedChangesDialog({
  open,
  onContinueEditing,
  onDiscard,
}: {
  open: boolean;
  onContinueEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Escape / overlay dismissal is the safe direction: back to editing,
        // never a silent discard.
        if (!next) onContinueEditing();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;re about to exit with unsaved changes. Continue, or go
            back to finish or save your progress.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onContinueEditing}>
            Go back
          </AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
