export type LoginSiteMismatch = 'main' | 'ua';

export function classifyLoginSiteMismatch({
  isUaHost,
  hasUaPartnerContext,
  uaOrganizationId,
  membershipOrganizationIds,
}: {
  isUaHost: boolean;
  hasUaPartnerContext: boolean;
  uaOrganizationId: string | null;
  membershipOrganizationIds: string[];
}): LoginSiteMismatch | null {
  if (!uaOrganizationId) return null;

  const hasUaMembership = membershipOrganizationIds.includes(uaOrganizationId);
  const hasNonUaMembership = membershipOrganizationIds.some(
    (organizationId) => organizationId !== uaOrganizationId
  );

  if (isUaHost) {
    return !hasUaMembership && hasNonUaMembership && !hasUaPartnerContext
      ? 'main'
      : null;
  }

  return hasUaMembership && !hasNonUaMembership ? 'ua' : null;
}
