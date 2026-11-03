import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { LockedTeachingControl } from '~/components/free-tier/locked-teaching-control';
import { useLockedTeachingInviteControlProps } from '~/components/free-tier/locked-teaching-invite-props';
import { freeTierGlassyOverlayChipClassName } from '~/components/free-tier/glassy-overlay-chip';
import { StudentInvitationDialog } from '~/components/student-invitation-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/utils/misc';

export function TeacherClassCardMenuOverlay({
  title,
  imageHeightClass,
  showLockedInvite,
  showInviteMenu,
  classCode,
}: {
  title: string;
  imageHeightClass: string;
  showLockedInvite: boolean;
  showInviteMenu: boolean;
  classCode: string | null | undefined;
}) {
  const inviteLockProps = useLockedTeachingInviteControlProps();
  const [invitationOpen, setInvitationOpen] = useState(false);
  const invitationTriggerRef = useRef<HTMLButtonElement>(null);

  if (!showLockedInvite && !showInviteMenu) {
    return null;
  }

  const menuButton = (
    <button
      type="button"
      ref={showInviteMenu ? invitationTriggerRef : undefined}
      data-testid="my-classes-class-options"
      aria-label={`Class options for ${title}`}
      className={cn(
        'flex size-8 items-center justify-center text-slate-800 hover:bg-white',
        freeTierGlassyOverlayChipClassName()
      )}
    >
      <MoreHorizontal size={18} aria-hidden className="text-slate-800" />
    </button>
  );

  return (
    <>
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-10',
          imageHeightClass
        )}
      >
        <div className="pointer-events-auto absolute right-2 top-2">
          {showLockedInvite ? (
            <LockedTeachingControl {...inviteLockProps}>
              {menuButton}
            </LockedTeachingControl>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>{menuButton}</DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setInvitationOpen(true)}>
                  Add your students to your class
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {showInviteMenu && classCode ? (
        <StudentInvitationDialog
          returnFocusRef={invitationTriggerRef}
          code={classCode}
          open={invitationOpen}
          onOpenChange={setInvitationOpen}
        />
      ) : null}
    </>
  );
}
