import { EXIT_TICKET_GRADING_V2_FLAG } from './exit-ticket-grading-v2-flag';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';

/** Global rollout only. Fails closed when the Setting row is missing. */
export async function isExitTicketGradingV2RolloutEnabled(): Promise<boolean> {
  return isFeatureFlagEnabled(EXIT_TICKET_GRADING_V2_FLAG, null);
}