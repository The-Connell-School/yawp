import { describe, expect, mock, test } from 'bun:test';

mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { User: 'user', Assistant: 'assistant' },
  getLLMCompletion: mock(),
}));

const { buildSeedGeneratorSystemPrompt, classifySeedGeneratorError } =
  await import('./seed-generator-propose.server');

const context = {
  organizationId: 'org-1',
  organizationName: 'Acme High',
  existingClasses: [
    { id: 'class-existing', title: 'English 9', grade: '9', period: '3' },
  ],
  existingAssignmentTypes: [
    {
      id: 'type-1',
      title: 'The Thesis-Driven Essay',
      description: null,
    },
  ],
};

describe('buildSeedGeneratorSystemPrompt', () => {
  test('teaches the draft/submitted distinction with the required worked examples', () => {
    const prompt = buildSeedGeneratorSystemPrompt(context, []);

    expect(prompt).toContain('not yet graded');
    expect(prompt).toMatch(/not yet graded[^\n]*submitted/i);
    expect(prompt).toContain("hasn't turned it in");
    expect(prompt).toMatch(/hasn't turned it in[^\n]*draft/i);
  });

  test('forbids essay prose and grades during the structural pass', () => {
    const prompt = buildSeedGeneratorSystemPrompt(context, []);
    expect(prompt).toMatch(/do not[^\n]*essay/i);
    expect(prompt).toMatch(/do not[^\n]*grade/i);
  });

  test('includes the durable current graph so follow-up references can resolve', () => {
    const prompt = buildSeedGeneratorSystemPrompt(context, [
      {
        localId: 'student-1',
        kind: 'student',
        parentLocalId: 'class-existing',
        status: 'committed',
        committedEntityId: 'membership-real-1',
        data: { name: 'Maya R.', writingProfile: 'on_track' },
      },
    ]);

    expect(prompt).toContain('student-1');
    expect(prompt).toContain('membership-real-1');
    expect(prompt).toContain('Maya R.');
  });
});

describe('classifySeedGeneratorError', () => {
  test('classifies timeouts, rate limits, and provider outages as transient', () => {
    expect(
      classifySeedGeneratorError(
        Object.assign(new Error('request timed out'), { name: 'AbortError' })
      ).type
    ).toBe('transient');
    expect(classifySeedGeneratorError({ status: 429 }).type).toBe('transient');
    expect(classifySeedGeneratorError({ status: 529 }).type).toBe('transient');
  });

  test('classifies schema/tool-output failures as unparseable', () => {
    expect(
      classifySeedGeneratorError(new Error('Invalid tool output')).type
    ).toBe('unparseable');
  });
});
