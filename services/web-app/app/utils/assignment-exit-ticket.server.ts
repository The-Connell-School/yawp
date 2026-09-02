import {
  type ExitTicketConfig,
  composeExitTicketPrompt,
  parseExitTicketConfigInput,
} from '~/domain/assignment-types/exit-ticket';

export type ParseAssignmentExitTicketResult =
  | {
      success: true;
      value: { prompt: string; exitTicketConfigJson: ExitTicketConfig };
    }
  | { success: false; message: string };

/**
 * Turns the exit ticket answers on a create/edit assignment form into the
 * assignment's prompt and the config recorded beside it.
 *
 * The sheet also posts the composed prompt, so the form's existing
 * required-prompt validation still applies, but the prompt is recomposed here
 * from the answers rather than taken from the request: what students read on
 * an exit ticket is the product's wording, not whatever a client sent.
 */
export function parseAssignmentExitTicket(
  formData: FormData
): ParseAssignmentExitTicketResult {
  const parsed = parseExitTicketConfigInput({
    mode: formData.get('exitTicketMode')?.toString(),
    focus: formData.get('exitTicketFocus')?.toString(),
    topic: formData.get('exitTicketTopic')?.toString(),
  });

  if (!parsed.success) return parsed;

  return {
    success: true,
    value: {
      prompt: composeExitTicketPrompt(parsed.config),
      exitTicketConfigJson: parsed.config,
    },
  };
}
