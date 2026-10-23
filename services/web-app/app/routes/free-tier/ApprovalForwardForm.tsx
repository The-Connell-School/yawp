import { Form } from 'react-router';
import {
  forwardInlineAlert,
  forwardRateLimitedBody,
  unableToForwardBody,
} from '~/domain/free-tier/admin-approval-copy';
import {
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from './FreeTierAuthCard';
export function ApprovalForwardForm({
  approvalId,
  token,
  busy = false,
  action = '',
}: {
  approvalId?: string;
  token?: string;
  busy?: boolean;
  action?: string;
}) {
  return (
    <Form method="post" action={action} className="flex flex-col gap-4 text-sm">
      <input type="hidden" name="intent" value="forward" />
      {approvalId ? (
        <input type="hidden" name="approvalId" value={approvalId} />
      ) : null}
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <FreeTierFieldLabel
        label="Administrator name"
        htmlFor="forward-adminName"
      >
        <FreeTierTextInput
          id="forward-adminName"
          name="adminName"
          maxLength={120}
          required
        />
      </FreeTierFieldLabel>
      <FreeTierFieldLabel
        label="Administrator email"
        htmlFor="forward-adminEmail"
      >
        <FreeTierTextInput
          id="forward-adminEmail"
          name="adminEmail"
          type="email"
          maxLength={254}
          required
        />
      </FreeTierFieldLabel>
      <FreeTierButton type="submit" disabled={busy}>
        {busy ? 'Forwarding…' : 'Forward request'}
      </FreeTierButton>
    </Form>
  );
}

export function approvalForwardError(
  reason: string,
  options: {
    pass1?: boolean;
    teacherName?: string;
    schoolName?: string;
    adminName?: string;
  } = {}
) {
  const pass1 = options.pass1 ?? false;
  const teacherName = options.teacherName ?? 'A teacher';
  const schoolName = options.schoolName ?? 'your school';
  switch (reason) {
    case 'validation':
      return 'Enter their name and a valid email address.';
    case 'same_administrator':
      return forwardInlineAlert({
        reason: 'same_administrator',
        teacherName,
        schoolName,
        adminName: options.adminName,
        pass1,
      });
    case 'same_as_teacher':
      return forwardInlineAlert({
        reason: 'same_as_teacher',
        teacherName,
        schoolName,
        pass1,
      });
    case 'chain_cap':
      return forwardInlineAlert({
        reason: 'chain_cap',
        teacherName,
        schoolName,
        pass1,
      });
    case 'email_failed':
      return forwardInlineAlert({
        reason: 'email_failed',
        teacherName,
        schoolName,
        pass1,
      });
    case 'superseded':
      return 'This request has changed. Reload the page to see the current administrator.';
    case 'rate_limited':
      return forwardRateLimitedBody();
    default:
      return unableToForwardBody(teacherName, schoolName, pass1);
  }
}
