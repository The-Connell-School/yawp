import { describe, expect, test } from 'bun:test';
import { deidentifyLlmLogData } from './llm-log-deidentify.server';

describe('LlmLog de-identification', () => {
  test('scrubs structured identifiers and feasible in-text PII while keeping prompt and response text', () => {
    const data = deidentifyLlmLogData({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      systemPrompt:
        'Help Maria Rivera at maria.rivera@example.edu with class cmabc12345678901234567890.',
      messages: [
        {
          role: 'user',
          name: 'mrivera',
          content: 'I am Maria Rivera, @mrivera, email maria.rivera@example.edu.',
        },
      ],
      response: 'Maria Rivera should revise the thesis.',
      error: 'Failed for maria.rivera@example.edu',
      metadata: {
        feature: 'tutor',
        route: 'routes/api.domain.tutor-response',
        organizationId: 'org-1',
        membershipId: 'mem-1',
        requestId: 'req-1',
        studentName: 'Maria Rivera',
        studentEmail: 'maria.rivera@example.edu',
        username: 'mrivera',
      },
    });

    const serialized = JSON.stringify(data);

    expect(data.systemPrompt).toContain('Help [name]');
    expect(data.response).toContain('[name] should revise');
    expect(data.messages).toEqual([
      {
        role: 'user',
        content: 'I am [name], @[username], email [email].',
      },
    ]);
    expect(data.metadata).toMatchObject({
      feature: 'tutor',
      route: 'routes/api.domain.tutor-response',
      deidentified: true,
      deidentificationVersion: 1,
    });
    expect(serialized).not.toContain('Maria');
    expect(serialized).not.toContain('Rivera');
    expect(serialized).not.toContain('maria.rivera@example.edu');
    expect(serialized).not.toContain('org-1');
    expect(serialized).not.toContain('mem-1');
    expect(serialized).not.toContain('req-1');
  });
});
