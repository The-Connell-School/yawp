/**
 * Exit ticket wording (Brian's round 5, item 3): the type's own rules, so
 * every exit ticket gets them, from the planner or from the form.
 */
import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_EXPLAIN_NOTE,
  EXIT_TICKET_FOCUS_OPTIONS,
  EXIT_TICKET_REFLECTION_PROMPT_OPTIONS,
  EXIT_TICKET_SHORT_NOTE,
  composeExitTicketPrompt,
  type ExitTicketConfig,
} from './exit-ticket';

const OLD_PHRASES = [
  /not (?:a|the) definition/i,
  /actually understand it to mean/i,
  /missed class/i,
  /first sentence/i,
];

function everyComposedPrompt(): Array<{ name: string; prompt: string }> {
  const checks = EXIT_TICKET_FOCUS_OPTIONS.map((option) => ({
    name: option.value,
    prompt: composeExitTicketPrompt({
      schemaVersion: 1,
      mode: 'specific',
      focus: option.value,
      topic: 'the single most effective rhetorical move in Common Sense',
      answerType: 'subjective',
    }),
  }));
  const reflections = EXIT_TICKET_REFLECTION_PROMPT_OPTIONS.filter((option) => option.id !== 'custom').map(
    (option) => ({
      name: option.id,
      prompt: composeExitTicketPrompt({
        schemaVersion: 1,
        mode: 'basic',
        ...(option.id === 'learned' ? {} : { reflectionPrompt: { id: option.id as 'interesting' | 'wondering' } }),
      } as ExitTicketConfig),
    })
  );
  return [...checks, ...reflections];
}

describe('exit ticket wording (round 5, item 3)', () => {
  test('the explain ending is exactly the sentence Brian wrote', () => {
    expect(EXIT_TICKET_EXPLAIN_NOTE).toBe(
      'Keep it conversational, in your words, and write as much as you can — the more you can explain your thinking, the better. Don’t worry too much about polish. This is about what you understand, not writing perfectly.'
    );
  });

  test('no composed prompt uses the old language', () => {
    for (const { name, prompt } of everyComposedPrompt()) {
      for (const phrase of OLD_PHRASES) {
        expect({ name, matched: phrase.test(prompt) }).toEqual({ name, matched: false });
      }
    }
  });

  test('a ticket that asks students to explain in their own words ends on the explain note', () => {
    for (const name of ['explain-concept', 'understand-text', 'learned', 'interesting']) {
      const prompt = everyComposedPrompt().find((entry) => entry.name === name)!.prompt;
      expect(prompt.endsWith(EXIT_TICKET_EXPLAIN_NOTE)).toBe(true);
    }
  });

  test('a ticket that asks for a question gets the short note, never "write as much as you can"', () => {
    for (const name of ['ask-question', 'wondering']) {
      const prompt = everyComposedPrompt().find((entry) => entry.name === name)!.prompt;
      expect(prompt.endsWith(EXIT_TICKET_SHORT_NOTE)).toBe(true);
      expect(prompt).not.toInclude('write as much as you can');
    }
  });

  test('explain-concept reads as one plain ask', () => {
    const prompt = composeExitTicketPrompt({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'the single most effective rhetorical move in Common Sense',
      answerType: 'subjective',
    });
    expect(prompt.startsWith('In your own words, explain the single most effective rhetorical move in Common Sense.')).toBe(true);
  });

  test("a teacher's own prompt is a reflection unless it asks for a question", () => {
    const explain = composeExitTicketPrompt({
      schemaVersion: 1,
      mode: 'basic',
      reflectionPrompt: { id: 'custom', text: 'Explain in your own words why Paine calls government a necessary evil.' },
    });
    expect(explain.endsWith(EXIT_TICKET_EXPLAIN_NOTE)).toBe(true);
    const question = composeExitTicketPrompt({
      schemaVersion: 1,
      mode: 'basic',
      reflectionPrompt: { id: 'custom', text: 'What questions do you still have about Paine’s argument?' },
    });
    expect(question.endsWith(EXIT_TICKET_SHORT_NOTE)).toBe(true);
  });
});
