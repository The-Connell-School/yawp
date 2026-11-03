import { useEffect, useId, useRef, useState } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  TEACHER_INVITE_ALL_FAILED_MESSAGE,
  nextTeacherInviteEmailsAfterResult,
  teacherInvitePartialFailureMessage,
  teacherInviteSuccessMessage,
} from './teacher-invite-copy';

export type InviteTeachersActionData =
  | { error: string }
  | { sentCount: number; failedEmails: string[] };

export function InviteTeachersSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inviteFetcher = useFetcher<InviteTeachersActionData>();
  const revalidator = useRevalidator();
  const [emails, setEmails] = useState('');
  const emailsBeforeSubmitRef = useRef('');
  const statusRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const emailsFieldId = useId();

  const inviteResult =
    inviteFetcher.data && 'sentCount' in inviteFetcher.data
      ? inviteFetcher.data
      : null;
  const sentCount = inviteResult?.sentCount ?? 0;
  const failedEmails = inviteResult?.failedEmails ?? [];
  const showSuccess = sentCount > 0;
  const showAllFailed =
    inviteResult !== null && sentCount === 0 && failedEmails.length > 0;
  const showPartialFailure =
    inviteResult !== null && sentCount > 0 && failedEmails.length > 0;
  const actionError =
    inviteFetcher.data &&
    'error' in inviteFetcher.data &&
    inviteFetcher.data.error &&
    inviteResult === null
      ? inviteFetcher.data.error
      : null;
  const isValidationError =
    actionError === 'Emails are required' ||
    actionError === 'No valid emails provided';
  const showValidationError = Boolean(actionError && isValidationError);
  const showServerError = Boolean(actionError && !isValidationError);

  useEffect(() => {
    if (inviteFetcher.state !== 'idle' || !inviteFetcher.data) {
      return;
    }

    if (
      inviteFetcher.data &&
      'sentCount' in inviteFetcher.data &&
      typeof inviteFetcher.data.sentCount === 'number'
    ) {
      const { sentCount: deliveredCount, failedEmails: undeliveredEmails } =
        inviteFetcher.data;
      setEmails(
        nextTeacherInviteEmailsAfterResult({
          currentEmails: emailsBeforeSubmitRef.current,
          sentCount: deliveredCount,
          failedEmails: undeliveredEmails,
        })
      );
      if (deliveredCount > 0) {
        revalidator.revalidate();
      }
    }

    if (isValidationError) {
      return;
    }

    (alertRef.current ?? statusRef.current)?.focus();
  }, [inviteFetcher.state, inviteFetcher.data, isValidationError]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Invite Teachers</SheetTitle>
        </SheetHeader>
        <inviteFetcher.Form
          method="post"
          className="mt-4 space-y-4"
          onSubmit={() => {
            emailsBeforeSubmitRef.current = emails;
          }}
        >
          <input type="hidden" name="intent" value="invite-teachers" />
          <div className="space-y-2">
            <Label htmlFor={emailsFieldId}>
              Email addresses (comma or line separated)
            </Label>
            <Textarea
              id={emailsFieldId}
              name="emails"
              placeholder="teacher1@example.com, teacher2@example.com"
              rows={4}
              required
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
            />
          </div>
          {showValidationError ? (
            <div className="text-sm text-red-600">{actionError}</div>
          ) : null}
          {showServerError ? (
            <div
              ref={alertRef}
              tabIndex={-1}
              role="alert"
              className="text-sm text-red-600"
            >
              {actionError}
            </div>
          ) : null}
          {showSuccess ? (
            <div
              ref={showPartialFailure ? undefined : statusRef}
              tabIndex={showPartialFailure ? undefined : -1}
              role="status"
              className="text-sm text-green-600"
            >
              {teacherInviteSuccessMessage(sentCount)}
            </div>
          ) : null}
          {showAllFailed ? (
            <div
              ref={alertRef}
              tabIndex={-1}
              role="alert"
              className="text-sm text-red-600"
            >
              {TEACHER_INVITE_ALL_FAILED_MESSAGE}
            </div>
          ) : null}
          {showPartialFailure ? (
            <div
              ref={alertRef}
              tabIndex={-1}
              role="alert"
              className="text-sm text-red-600"
            >
              {teacherInvitePartialFailureMessage(failedEmails)}
            </div>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={inviteFetcher.state !== 'idle'}
          >
            {inviteFetcher.state !== 'idle'
              ? 'Sending...'
              : 'Send Invitations'}
          </Button>
        </inviteFetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
