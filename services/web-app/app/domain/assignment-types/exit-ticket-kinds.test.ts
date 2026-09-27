import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_EXIT_TICKET_KIND,
  EXIT_TICKET_BUILDER_V2_ENABLED,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_KIND_OPTIONS,
  EXIT_TICKET_KINDS,
  exitTicketKind,
  exitTicketKindForMode,
  exitTicketModeForKind,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
} from './exit-ticket';

const CHECK_ANSWERS = {
  focus: 'explain-concept',
  topic: 'the difference between a theme and a topic',
  answerType: 'objective',
} as const;

describe('exit ticket kinds', () => {
  test('are reflection and check for understanding, reflection first', () => {
    expect(EXIT_TICKET_KINDS).toEqual(['reflection', 'check']);
    expect(DEFAULT_EXIT_TICKET_KIND).toBe('reflection');
    expect(EXIT_TICKET_KIND_OPTIONS.map((option) => option.value)).toEqual([
      'reflection',
      'check',
    ]);
    for (const option of EXIT_TICKET_KIND_OPTIONS) {
      expect(option.label.trim()).not.toBe('');
      // One short line each: the long explanation lives behind a disclosure.
      expect(option.helperText.length).toBeLessThanOrEqual(80);
    }
  });

  test('map one to one onto the stored modes', () => {
    expect(exitTicketModeForKind('reflection')).toBe('basic');
    expect(exitTicketModeForKind('check')).toBe('specific');
    expect(exitTicketKindForMode('basic')).toBe('reflection');
    expect(exitTicketKindForMode('specific')).toBe('check');
  });

  test('the new builder sits behind its own flag', () => {
    expect(typeof EXIT_TICKET_BUILDER_V2_ENABLED).toBe('boolean');
  });
});

describe('parseExitTicketConfigInput with a kind', () => {
  test('a reflection is a basic ticket that records its kind', () => {
    const result = parseExitTicketConfigInput({ kind: 'reflection' });
    expect(result).toEqual({
      success: true,
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
        kind: 'reflection',
      },
    });
  });

  test('a check is a specific ticket that records its kind', () => {
    const result = parseExitTicketConfigInput({
      kind: 'check',
      ...CHECK_ANSWERS,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config).toMatchObject({
      mode: 'specific',
      kind: 'check',
      focus: 'explain-concept',
      answerType: 'objective',
    });
  });

  test('a check still needs its focus, topic and answer type', () => {
    expect(parseExitTicketConfigInput({ kind: 'check' }).success).toBe(false);
    expect(
      parseExitTicketConfigInput({ kind: 'check', focus: 'explain-concept' })
        .success
    ).toBe(false);
  });

  test('an unknown kind is reported, never downgraded', () => {
    expect(parseExitTicketConfigInput({ kind: 'quiz' })).toEqual({
      success: false,
      message: 'Exit ticket type is invalid.',
    });
  });

  test('a kind that contradicts the posted mode is reported', () => {
    expect(
      parseExitTicketConfigInput({ kind: 'reflection', mode: 'specific' })
        .success
    ).toBe(false);
  });

  test('a kind that agrees with the posted mode is fine (dual-write)', () => {
    const result = parseExitTicketConfigInput({
      kind: 'check',
      mode: 'specific',
      ...CHECK_ANSWERS,
    });
    expect(result.success).toBe(true);
  });

  test('without a kind nothing changes: v1 clients store no kind', () => {
    const result = parseExitTicketConfigInput({ mode: 'basic' });
    expect(result).toEqual({
      success: true,
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
      },
    });
  });
});

describe('exitTicketKind', () => {
  test('reads the stored kind, or derives it from mode for older rows', () => {
    expect(
      exitTicketKind({ schemaVersion: 1, mode: 'basic', kind: 'reflection' })
    ).toBe('reflection');
    expect(exitTicketKind({ schemaVersion: 1, mode: 'basic' })).toBe(
      'reflection'
    );
    expect(
      exitTicketKind({
        schemaVersion: 1,
        mode: 'specific',
        focus: 'ask-question',
        topic: 'semicolons',
        answerType: 'subjective',
      })
    ).toBe('check');
  });
});

describe('parseStoredExitTicketConfig with a kind', () => {
  test('keeps a stored kind that agrees with its mode', () => {
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        kind: 'reflection',
      })
    ).toEqual({ schemaVersion: 1, mode: 'basic', kind: 'reflection' });
  });

  test('drops a stored kind that disagrees with its mode; mode wins', () => {
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        kind: 'check',
      })
    ).toEqual({ schemaVersion: 1, mode: 'basic' });
  });
});
