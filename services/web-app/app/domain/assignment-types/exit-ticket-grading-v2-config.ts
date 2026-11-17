import { EXIT_TICKET_ASSIGNMENT_TYPE_KIND } from './exit-ticket';
import { applyExitTicketGradingAssistant } from './exit-ticket-grading-assistant';
import type { ExitTicketGradingAssistantPromptInput } from './exit-ticket-grading-assistant';

type ExitTicketGradingConfigSlice = Parameters<
  typeof applyExitTicketGradingAssistant
>[0];

/** When the global flag is off, stored assignment-type rubrics are left unchanged. */
export function applyExitTicketGradingWhenV2Enabled<T extends ExitTicketGradingConfigSlice>(
  v2Enabled: boolean,
  config: T,
  input: ExitTicketGradingAssistantPromptInput = {}
): T {
  if (!v2Enabled || config.assignmentTypeKind !== EXIT_TICKET_ASSIGNMENT_TYPE_KIND) {
    return config;
  }
  return applyExitTicketGradingAssistant(config, input);
}