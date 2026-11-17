import {
  EXIT_TICKET_GRADING_V2_FLAG,
  type FeatureFlagKey,
} from '~/domain/feature-flags/feature-flags';

export { EXIT_TICKET_GRADING_V2_FLAG };

export function isExitTicketGradingV2FlagKey(
  key: FeatureFlagKey
): key is typeof EXIT_TICKET_GRADING_V2_FLAG {
  return key === EXIT_TICKET_GRADING_V2_FLAG;
}