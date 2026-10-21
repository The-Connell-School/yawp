import { Form } from 'react-router';
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
export function approvalForwardError(reason: string) {
  switch (reason) {
    case 'validation':
      return 'Enter their name and a valid email address.';
    case 'same_administrator':
      return 'Choose a different administrator to forward this request.';
    case 'chain_cap':
      return 'This request was forwarded too many times. Email support@yawp.school and we will sort it out.';
    case 'superseded':
      return 'This request has changed. Reload the page to see the current administrator.';
    case 'rate_limited':
      return 'Please wait a few minutes before trying again.';
    default:
      return 'We could not forward this request. Reload the page or contact support@yawp.school.';
  }
}
