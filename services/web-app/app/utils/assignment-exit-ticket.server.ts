import {
  EXIT_TICKETS_ENABLED,
  type ExitTicketConfig,
  composeExitTicketPrompt,
  isExitTicketAssignmentType,
  parseExitTicketConfigInput,
} from '~/domain/assignment-types/exit-ticket';
import { parseSubmitForGrade } from './assignment-grading-intent.server';

function isGraded(formData: FormData): boolean {
  const parsed = parseSubmitForGrade(formData);
  return parsed.success && parsed.value;
}

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
  // Only the quick builder knows about grading criteria, and it always posts
  // a kind. A form without one is from the original builder, which is never
  // held to criteria it had no way to collect.
  const fromQuickBuilder = formData.has('exitTicketKind');
  const parsed = parseExitTicketConfigInput({
    // Posted only by the quick builder, always beside the mode it names.
    kind: formData.get('exitTicketKind')?.toString(),
    mode: formData.get('exitTicketMode')?.toString(),
    // Quick builder only, and only for a reflection that is not the default.
    reflectionPrompt: formData.get('exitTicketReflectionPrompt')?.toString(),
    reflectionPromptText: formData
      .get('exitTicketReflectionPromptText')
      ?.toString(),
    focus: formData.get('exitTicketFocus')?.toString(),
    topic: formData.get('exitTicketTopic')?.toString(),
    // Required on a specific ticket, and deliberately without a default: it
    // decides whether the grader may tell a student their answer is wrong.
    answerType: formData.get('exitTicketAnswerType')?.toString(),
    // Teacher-only context. Stored beside the ticket, never composed into the
    // prompt: the sheet renders these fields only while notes are switched on,
    // so a ticket without notes posts nothing here and stores nothing.
    lessonMainPoints: formData.get('exitTicketLessonMainPoints')?.toString(),
    lessonMustMention: formData.get('exitTicketLessonMustMention')?.toString(),
    lessonWatchFor: formData.get('exitTicketLessonWatchFor')?.toString(),
    ...(fromQuickBuilder
      ? {
          // Read exactly as the gradebook reads it, so the ticket is held to
          // criteria precisely when it is going to be graded.
          graded: isGraded(formData),
          gradingBasis: formData.get('exitTicketGradingBasis')?.toString(),
          minWords: formData.get('exitTicketMinWords')?.toString(),
          minSentences: formData.get('exitTicketMinSentences')?.toString(),
          assessFor: formData.get('exitTicketAssessFor')?.toString(),
        }
      : {}),
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

export type ResolveAssignmentPromptResult =
  | {
      success: true;
      prompt: string;
      /**
       * Null for everything that is not an exit ticket. Update paths write the
       * null so a type changed away from Exit Ticket does not keep a config
       * describing a prompt it no longer has; create paths skip it.
       */
      exitTicketConfigJson: ExitTicketConfig | null;
    }
  | { success: false; message: string };

/**
 * The prompt to store for an assignment, and the exit ticket config to store
 * beside it.
 *
 * Every create and edit path runs through this so an exit ticket cannot be
 * saved with a hand-written prompt on one route and a composed one on
 * another. For every other assignment type it hands back the posted prompt
 * unchanged.
 */
export function resolveAssignmentPrompt({
  assignmentTypeKind,
  postedPrompt,
  formData,
}: {
  assignmentTypeKind: string | null | undefined;
  postedPrompt: string;
  formData: FormData;
}): ResolveAssignmentPromptResult {
  if (
    !EXIT_TICKETS_ENABLED ||
    !isExitTicketAssignmentType({ kind: assignmentTypeKind })
  ) {
    return {
      success: true,
      prompt: postedPrompt,
      exitTicketConfigJson: null,
    };
  }

  const exitTicket = parseAssignmentExitTicket(formData);
  if (!exitTicket.success) return exitTicket;

  return {
    success: true,
    prompt: exitTicket.value.prompt,
    exitTicketConfigJson: exitTicket.value.exitTicketConfigJson,
  };
}
