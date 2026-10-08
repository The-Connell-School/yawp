import { describe, expect, test } from 'bun:test';
import {
  BASIC_EXIT_TICKET_PROMPT,
  DEFAULT_EXIT_TICKET_REFLECTION_PROMPT,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH,
  EXIT_TICKET_ELABORATION_NOTE,
  EXIT_TICKET_REFLECTION_PROMPT_OPTIONS,
  composeExitTicketPrompt,
  exitTicketFocusOption,
  exitTicketReflectionPromptId,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
} from './exit-ticket';
import { buildExitTicketGradingContext } from './exit-ticket-rubric';

describe('suggested reflection prompts', () => {
  test('are a short list, "what I learned" first, then write your own', () => {
    expect(EXIT_TICKET_REFLECTION_PROMPT_OPTIONS.map((o) => o.id)).toEqual([
      'learned',
      'interesting',
      'wondering',
      'custom',
    ]);
    expect(DEFAULT_EXIT_TICKET_REFLECTION_PROMPT).toBe('learned');
  });

  test('"what I learned" is the original basic prompt, word for word', () => {
    const learned = EXIT_TICKET_REFLECTION_PROMPT_OPTIONS.find(
      (option) => option.id === 'learned'
    );
    expect(learned?.prompt).toBe(BASIC_EXIT_TICKET_PROMPT);
  });

  test('every suggestion has a label and a prompt; custom has neither prompt', () => {
    for (const option of EXIT_TICKET_REFLECTION_PROMPT_OPTIONS) {
      expect(option.label.trim()).not.toBe('');
      if (option.id === 'custom') {
        expect(option.prompt).toBeUndefined();
      } else {
        expect(option.prompt?.trim()).not.toBe('');
      }
    }
  });
});

describe('parseExitTicketConfigInput with a reflection prompt', () => {
  test('the default prompt stores nothing extra, so it reads like v1', () => {
    const result = parseExitTicketConfigInput({
      kind: 'reflection',
      reflectionPrompt: 'learned',
    });
    expect(result).toEqual({
      success: true,
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
        kind: 'reflection',
      },
    });
  });

  test('a suggested prompt is stored by id', () => {
    const result = parseExitTicketConfigInput({
      kind: 'reflection',
      reflectionPrompt: 'wondering',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config).toMatchObject({
      mode: 'basic',
      reflectionPrompt: { id: 'wondering' },
    });
  });

  test('a custom prompt is stored with its text, whitespace tidied', () => {
    const result = parseExitTicketConfigInput({
      kind: 'reflection',
      reflectionPrompt: 'custom',
      reflectionPromptText: '  What would you  teach a friend\nabout today?  ',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config).toMatchObject({
      reflectionPrompt: {
        id: 'custom',
        text: 'What would you teach a friend about today?',
      },
    });
  });

  test('a custom prompt must say something', () => {
    expect(
      parseExitTicketConfigInput({
        kind: 'reflection',
        reflectionPrompt: 'custom',
        reflectionPromptText: '   ',
      })
    ).toEqual({
      success: false,
      message: 'Write the question students will answer.',
    });
  });

  test('a custom prompt has a length limit', () => {
    const result = parseExitTicketConfigInput({
      kind: 'reflection',
      reflectionPrompt: 'custom',
      reflectionPromptText: 'x'.repeat(
        EXIT_TICKET_CUSTOM_PROMPT_MAX_LENGTH + 1
      ),
    });
    expect(result.success).toBe(false);
  });

  test('an unknown prompt id is reported', () => {
    expect(
      parseExitTicketConfigInput({
        kind: 'reflection',
        reflectionPrompt: 'feelings',
      }).success
    ).toBe(false);
  });

  test('a check ignores any reflection prompt that came along', () => {
    const result = parseExitTicketConfigInput({
      kind: 'check',
      focus: 'explain-concept',
      topic: 'semicolons',
      answerType: 'objective',
      reflectionPrompt: 'custom',
      reflectionPromptText: 'ignored',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect('reflectionPrompt' in result.config).toBe(false);
  });
});

describe('composeExitTicketPrompt for reflections', () => {
  test('a suggested prompt, with the elaboration note after it', () => {
    const wondering = EXIT_TICKET_REFLECTION_PROMPT_OPTIONS.find(
      (option) => option.id === 'wondering'
    )!;
    expect(
      composeExitTicketPrompt({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'wondering' },
      })
    ).toBe(`${wondering.prompt}\n\n${EXIT_TICKET_ELABORATION_NOTE}`);
  });

  test("the teacher's own words, with the elaboration note after them", () => {
    expect(
      composeExitTicketPrompt({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'custom', text: 'What surprised you?' },
      })
    ).toBe(`What surprised you?\n\n${EXIT_TICKET_ELABORATION_NOTE}`);
  });

  test('no reflection prompt is the original basic prompt', () => {
    expect(composeExitTicketPrompt({ schemaVersion: 1, mode: 'basic' })).toBe(
      `${BASIC_EXIT_TICKET_PROMPT}\n\n${EXIT_TICKET_ELABORATION_NOTE}`
    );
  });
});

describe('exitTicketReflectionPromptId', () => {
  test('reads the stored id, defaulting to "learned"', () => {
    expect(
      exitTicketReflectionPromptId({ schemaVersion: 1, mode: 'basic' })
    ).toBe('learned');
    expect(
      exitTicketReflectionPromptId({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'interesting' },
      })
    ).toBe('interesting');
  });
});

describe('parseStoredExitTicketConfig with a reflection prompt', () => {
  test('reads a stored suggestion and a stored custom prompt', () => {
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'interesting' },
      })
    ).toEqual({
      schemaVersion: 1,
      mode: 'basic',
      reflectionPrompt: { id: 'interesting' },
    });
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'custom', text: 'What surprised you?' },
      })
    ).toEqual({
      schemaVersion: 1,
      mode: 'basic',
      reflectionPrompt: { id: 'custom', text: 'What surprised you?' },
    });
  });

  test('an unreadable reflection prompt falls back to the default one', () => {
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'custom', text: '' },
      })
    ).toEqual({ schemaVersion: 1, mode: 'basic' });
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: 'wondering',
      })
    ).toEqual({ schemaVersion: 1, mode: 'basic' });
  });
});

describe('grading context for reflections', () => {
  test('"still wondering" is read like an ask-a-question check', () => {
    const context = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      reflectionPrompt: { id: 'wondering' },
    });
    expect(context).toInclude(
      exitTicketFocusOption('ask-question')!.gradingCriteria
    );
  });

  test('a custom prompt tells the grader to judge against it', () => {
    const context = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      reflectionPrompt: { id: 'custom', text: 'What surprised you?' },
    });
    expect(context).toInclude('What surprised you?');
  });

  test('the default reflection adds nothing, exactly as before', () => {
    expect(
      buildExitTicketGradingContext({
        schemaVersion: 1,
        mode: 'basic',
        kind: 'reflection',
      })
    ).toBeNull();
  });
});
