import type { RefObject } from 'react';
import { Lock } from 'lucide-react';
import { Link } from 'react-router';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import {
  teachingAccessMobileSheetBody,
  TEACHING_ACCESS_MOBILE_SHEET_TITLE,
} from '~/domain/free-tier/teaching-access-copy';

export function LockedTeachingMobileSheet({
  open,
  onOpenChange,
  returnFocusRef,
  adminName = 'your administrator',
  body,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  adminName?: string;
  body?: string;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && returnFocusRef?.current) {
          returnFocusRef.current.focus();
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="h-auto max-h-[min(90dvh,100%)] rounded-t-2xl pb-8"
        overlayClassName="bg-black/35"
        showCloseButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
        <SheetHeader className="items-start text-left">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <SheetTitle>{TEACHING_ACCESS_MOBILE_SHEET_TITLE}</SheetTitle>
        </SheetHeader>
        <p className="mt-2 text-sm text-muted-foreground">
          {body ?? teachingAccessMobileSheetBody(adminName)}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button
            type="button"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Got it
          </Button>
          <Link
            to="/app/free-tier/pending"
            className="text-center text-sm text-primary underline underline-offset-4"
            onClick={() => onOpenChange(false)}
          >
            View status
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
