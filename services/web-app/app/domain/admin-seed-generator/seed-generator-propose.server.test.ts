import { describe, expect, mock, test } from 'bun:test';

mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { User: 'user', Assistant: 'assistant' },
  getLLMCompletion: mock(),
}));

const {
  buildSeedGeneratorSystemPrompt,
  classifySeedGeneratorError,
  SEED_GRAPH_REQUEST_DEADLINE_MS,
  SEED_GRAPH_MAX_TOKENS,
} = await import('./seed-generator-propose.server');

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

  test('classifies the Anthropic SDK abort-signal error as transient, not unparseable', () => {
    // Reproduces live behavior: when our own AbortSignal.timeout() fires
    // mid-request, the Anthropic SDK throws an APIUserAbortError whose
    // `.name` is the generic "Error" and whose message is "Request was
    // aborted." -- it carries no status code either. Before this fix that
    // fell through every transient check and was misreported to the admin
    // as "could not turn those instructions into a valid graph... be more
    // precise", which reads as the model refusing when it was actually our
    // own deadline firing.
    class APIUserAbortError extends Error {}
    const error = new APIUserAbortError('Request was aborted.');
    expect(classifySeedGeneratorError(error).type).toBe('transient');
  });
});

describe('structural pass request budget', () => {
  // Regression guard for the live-reproduced root cause: a single
  // propose_seed_graph call for "a 9th grade English class with 25 students
  // and three assignments" (45 nodes) took 31.2s wall time and 3188 output
  // tokens against claude-sonnet-4-5. The old budget (5s deadline, 1800
  // max_tokens) aborted or truncated every non-trivial request and the abort
  // was misreported as the model refusing to comply. These floors keep that
  // regression from creeping back in.
  test('deadline comfortably exceeds observed live latency for a realistic request', () => {
    expect(SEED_GRAPH_REQUEST_DEADLINE_MS).toBeGreaterThanOrEqual(45_000);
  });

  test('max_tokens comfortably exceeds observed live output for a realistic request', () => {
    expect(SEED_GRAPH_MAX_TOKENS).toBeGreaterThanOrEqual(6_000);
  });
});
