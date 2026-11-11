import { EXIT_TICKET_BUILDER_V3_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';

/**
 * Whether teachers at this organization get the v3 exit ticket builder in the
 * assignment creation sheet. Read by every loader that renders the sheet; the
 * server accepts posts from either builder regardless, so a sheet opened
 * before the flag changed still saves.
 */
export async function isExitTicketBuilderV3Enabled(
  orgId?: string | null
): Promise<boolean> {
  return isFeatureFlagEnabled(EXIT_TICKET_BUILDER_V3_FLAG, orgId);
}
