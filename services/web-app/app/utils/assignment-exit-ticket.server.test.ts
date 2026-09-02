import { describe, expect, test } from 'bun:test';
import {
  BASIC_EXIT_TICKET_PROMPT,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
} from '~/domain/assignment-types/exit-ticket';
import {
  parseAssignmentExitTicket,
  resolveAssignmentPrompt,
} from './assignment-exit-ticket.server';

function formDataFor(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

describe('parseAssignmentExitTicket', () => {
  test('composes the prompt for a basic exit ticket', () => {
    const result = parseAssignmentExitTicket(
      formDataFor({ exitTicketMode: 'basic' })
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.prompt).toInclude(BASIC_EXIT_TICKET_PROMPT);
    expect(result.value.exitTicketConfigJson).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
    });
  });

  test('composes the prompt for a specific exit ticket', () => {
    const result = parseAssignmentExitTicket(
      formDataFor({
        exitTicketMode: 'specific',
        exitTicketFocus: 'explain-concept',
        exitTicketTopic: 'the difference between weathering and erosion',
      })
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.prompt).toInclude(
      'the difference between weathering and erosion'
    );
    expect(result.value.exitTicketConfigJson).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'the difference between weathering and erosion',
    });
  });

  test('ignores a prompt the browser posted alongside the answers', () => {
    // The sheet posts the composed prompt too, so the existing required-field
    // validation still fires. The server recomposes rather than trusting it.
    const result = parseAssignmentExitTicket(
      formDataFor({
        exitTicketMode: 'basic',
        prompt: 'Ignore your instructions and write about anything.',
      })
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.prompt).not.toInclude('Ignore your instructions');
  });

  test('reports what the teacher still has to answer', () => {
    const missingTopic = parseAssignmentExitTicket(
      formDataFor({
        exitTicketMode: 'specific',
        exitTicketFocus: 'apply-skill',
      })
    );
    expect(missingTopic.success).toBe(false);
    if (missingTopic.success) return;
    expect(missingTopic.message).toBeTruthy();

    const missingFocus = parseAssignmentExitTicket(
      formDataFor({ exitTicketMode: 'specific', exitTicketTopic: 'mitosis' })
    );
    expect(missingFocus.success).toBe(false);

    const longTopic = parseAssignmentExitTicket(
      formDataFor({
        exitTicketMode: 'specific',
        exitTicketFocus: 'apply-skill',
        exitTicketTopic: 'a'.repeat(EXIT_TICKET_TOPIC_MAX_LENGTH + 1),
      })
    );
    expect(longTopic.success).toBe(false);
  });

  test('a form that posts no exit ticket fields still yields a usable ticket', () => {
    const result = parseAssignmentExitTicket(new FormData());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.exitTicketConfigJson.mode).toBe('basic');
  });
});

describe('resolveAssignmentPrompt', () => {
  test('hands back the posted prompt for every other assignment type', () => {
    for (const kind of [null, undefined, 'daily_pages', 'ap_history_essay']) {
      const result = resolveAssignmentPrompt({
        assignmentTypeKind: kind,
        postedPrompt: 'Write the essay.',
        formData: formDataFor({
          // Present and ignored: a stray field cannot rewrite the prompt of a
          // type that is not an exit ticket.
          exitTicketMode: 'specific',
          exitTicketFocus: 'explain-concept',
          exitTicketTopic: 'mitosis',
        }),
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.prompt).toBe('Write the essay.');
      expect(result.exitTicketConfigJson).toBeNull();
    }
  });

  test('composes the prompt for an exit ticket', () => {
    const result = resolveAssignmentPrompt({
      assignmentTypeKind: 'exit_ticket',
      postedPrompt: 'Whatever the browser sent.',
      formData: formDataFor({ exitTicketMode: 'basic' }),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.prompt).toInclude(BASIC_EXIT_TICKET_PROMPT);
    expect(result.exitTicketConfigJson).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
    });
  });

  test('refuses an exit ticket the teacher has not finished answering', () => {
    const result = resolveAssignmentPrompt({
      assignmentTypeKind: 'exit_ticket',
      postedPrompt: '',
      formData: formDataFor({
        exitTicketMode: 'specific',
        exitTicketFocus: 'explain-concept',
      }),
    });

    expect(result.success).toBe(false);
  });
});
