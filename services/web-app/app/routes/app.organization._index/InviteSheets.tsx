import * as React from 'react';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { UserPlus } from 'lucide-react';
import { useFetcher } from 'react-router';

type InviteSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  intent: 'invite-teachers' | 'invite-students';
  variant?: 'default' | 'outline';
};

export function InviteSheet({
  open,
  onOpenChange,
  triggerLabel,
  intent,
  variant = 'default',
}: InviteSheetProps) {
  const fetcher = useFetcher();

  React.useEffect(() => {
    // Close the sheet after a successful submission
    if (fetcher.state === 'idle' && (fetcher.data as any)?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant={variant}>
          <UserPlus className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{triggerLabel}</SheetTitle>
        </SheetHeader>
        <fetcher.Form method="post" className="mt-4 space-y-4">
          <input type="hidden" name="intent" value={intent} />
          <div className="space-y-2">
            <Label htmlFor="emails">Email Addresses</Label>
            <Textarea
              id="emails"
              name="emails"
              placeholder="Enter email addresses, separated by commas or new lines"
              rows={6}
              required
            />
            <p className="text-sm text-muted-foreground">
              Email invitations will be sent to the provided email addresses if
              they are not already registered.
            </p>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={fetcher.state !== 'idle'}
          >
            {fetcher.state !== 'idle'
              ? intent === 'invite-teachers'
                ? 'Inviting...'
                : 'Inviting...'
              : intent === 'invite-teachers'
                ? 'Invite Teachers'
                : 'Invite Students'}
          </Button>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
