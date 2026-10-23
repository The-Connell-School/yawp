import { createHash } from 'node:crypto';
import {
  ADMIN_APPROVAL_EMAIL_COPY_VERSION,
  ADMIN_APPROVAL_EMAIL_COPY_VERSION_PASS1,
  renderAdminApprovalEmailBody,
  renderCongratulationsEmailBody,
  renderReleaseEmailBody,
} from './email-copy';

export {
  ADMIN_APPROVAL_EMAIL_COPY_VERSION,
  ADMIN_APPROVAL_EMAIL_COPY_VERSION_PASS1,
  renderAdminApprovalEmailBody,
  renderCongratulationsEmailBody,
  renderReleaseEmailBody,
};

export async function adminApprovalEmailCopyVersionHash() {
  const { isFreeTierEnabled } =
    await import('~/domain/feature-flags/feature-flags.server');
  const version = (await isFreeTierEnabled())
    ? ADMIN_APPROVAL_EMAIL_COPY_VERSION_PASS1
    : ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  return createHash('sha256').update(version).digest('hex');
}
