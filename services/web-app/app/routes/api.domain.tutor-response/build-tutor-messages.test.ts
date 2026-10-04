import { describe, expect, test } from 'bun:test';

import {
  TUTOR_CONVERSATION_OPENER,
  buildTutorMessages,
} from './build-tutor-messages';

const base = {
  history: [
    { agent: 'assistant', content: 'Welcome to your Daily Pages!' },
    { agent: 'user', content: 'Give me feedback' },
    { agent: 'assistant', content: 'What is your claim?' },
  ],
  assignment: {
    title: 'Juliet argues with a name',
    prompt: 'Quote the line where her argument turns.',
  },
  documentText: "Juliet's argument turns on one word.",
  documentSource: 'client-content' as const,
  documentSha256: 'abc123',
  studentMessage: 'Give me feedback',
};

/**
 * The tutor request the route sends and the one the tutor evaluation sends
 * are built by this one function, so an evaluation run tests the tutor
 * students actually get.
 */
describe('buildTutorMessages', () => {
  test('opens, replays the history, then gives the assignment, the draft and the new message', () => {
    const messages = buildTutorMessages(base);

    expect(messages.map((message) => message.role as string)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'user',
      'user',
    ]);
    expect(messages[0].content).toBe(TUTOR_CONVERSATION_OPENER);
    expect(messages[1] as unknown).toEqual({
      role: 'assistant',
      content: 'Welcome to your Daily Pages!',
      name: 'assistant',
    });
    expect(messages[4].content).toContain('<assignment_context>');
    expect(messages[4].content).toContain(
      '<assignment_prompt>Quote the line where her argument turns.</assignment_prompt>'
    );
    expect(messages[5].content).toBe(
      [
        `<student_document_context source="client-content" text_length="${base.documentText.length}" sha256="abc123">`,
        base.documentText,
        '</student_document_context>',
      ].join('\n')
    );
    expect(messages.at(-1) as unknown).toEqual({
      role: 'user',
      content: 'Give me feedback',
    });
  });

  test('leaves out the assignment block for a document with no assignment', () => {
    const messages = buildTutorMessages({ ...base, assignment: null });

    expect(messages).toHaveLength(6);
    expect(
      messages.some((message) => message.content.includes('<assignment_context>'))
    ).toBe(false);
  });

  test('escapes markup in the teacher’s prompt', () => {
    const messages = buildTutorMessages({
      ...base,
      assignment: { title: null, prompt: 'Compare <b>two</b> & more' },
    });

    expect(messages[4].content).toContain(
      'Compare &lt;b&gt;two&lt;/b&gt; &amp; more'
    );
  });
});
