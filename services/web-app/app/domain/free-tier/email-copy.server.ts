import { createHash } from 'node:crypto';
import {
  ADMIN_APPROVAL_EMAIL_COPY_VERSION,
  renderAdminApprovalEmailBody,
  renderCongratulationsEmailBody,
  renderReleaseEmailBody,
} from './email-copy';

export {
  ADMIN_APPROVAL_EMAIL_COPY_VERSION,
  renderAdminApprovalEmailBody,
  renderCongratulationsEmailBody,
  renderReleaseEmailBody,
};

export function adminApprovalEmailCopyVersionHash() {
  return createHash('sha256').update(ADMIN_APPROVAL_EMAIL_COPY_VERSION).digest('hex');
}
