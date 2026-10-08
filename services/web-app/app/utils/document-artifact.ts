/**
 * Tenant and display helpers that work for both solo student artifacts and
 * assignment-owned group artifacts. Callers should select both paths and never
 * infer a shared artifact's tenant or identity from an arbitrary group member.
 */
export function resolveDocumentOrganizationId(document: {
  membership?: { organizationId: string } | null;
  classAssignment?: {
    class?: { school?: { organizationId: string } | null } | null;
  } | null;
}): string | null {
  return (
    document.classAssignment?.class?.school?.organizationId ??
    document.membership?.organizationId ??
    null
  );
}

import { formatUserDisplayName } from '~/utils/user-display';

export function resolveDocumentActorLabel(document: {
  membership?: {
    user: { name: string | null; email?: string | null; username?: string | null };
  } | null;
  group?: { label: string } | null;
}): string {
  return (
    document.group?.label ??
    (document.membership?.user
      ? formatUserDisplayName(document.membership.user)
      : 'Student')
  );
}
