import * as React from 'react';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';

export type Invitation = {
  id: string;
  target: string;
  expiresAt: string | Date | null;
};

type InvitationsSheetProps = {
  title: string;
  invitations: Invitation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InvitationsSheet({
  title,
  invitations,
  open,
  onOpenChange,
}: InvitationsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {invitations.length === 0 ? (
            <p className="text-muted-foreground">
              No pending {title.toLowerCase()}
            </p>
          ) : (
            <div className="space-y-2">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="p-3 border rounded-lg">
                  <p className="font-medium">{invitation.target}</p>
                  <p className="text-sm text-muted-foreground">
                    Invitation is valid until{' '}
                    {invitation.expiresAt
                      ? new Date(invitation.expiresAt).toLocaleString([], {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : 'Never'}
                  </p>
                </div>
              ))}
            </div>
          )}
          <Button onClick={() => onOpenChange(false)} className="w-full mt-6">
            Ok
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
