import { describe, expect, test } from 'bun:test';
import { deidentifyLlmLogData } from './llm-log-deidentify.server';

describe('LlmLog de-identification', () => {
  test('scrubs structured identifiers and feasible in-text PII while keeping prompt and response text', () => {
    const data = deidentifyLlmLogData({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      systemPrompt:
        'Help Maria Rivera at maria.rivera@example.edu with class cmabc12345678901234567890 for membership mem-1, IP hash 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef, and user czzzzzzzzzzzzzzzzzzzz.',
      messages: [
        {
          role: 'user',
          name: 'mrivera',
          fileName: 'Maria Rivera essay.pdf',
          content:
            'I am Maria Rivera, @mrivera, email maria.rivera@example.edu. The uploaded file is Maria Rivera essay.pdf for org-1.',
        },
      ],
      response: 'Maria Rivera should revise the thesis for req-1.',
      error: 'Failed for maria.rivera@example.edu and studentId student-1',
      metadata: {
        feature: 'tutor',
        route: 'routes/api.domain.tutor-response',
        organizationId: 'org-1',
        membershipId: 'mem-1',
        requestId: 'req-1',
        ipHash:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        userId: 'czzzzzzzzzzzzzzzzzzzz',
        studentId: 'student-1',
        studentName: 'Maria Rivera',
        studentEmail: 'maria.rivera@example.edu',
        username: 'mrivera',
        fileName: 'Maria Rivera essay.pdf',
        upload: {
          originalFilename: 'Maria Rivera notes.pdf',
        },
      },
    });

    const serialized = JSON.stringify(data);

    expect(data.systemPrompt).toContain('Help [name]');
    expect(data.response).toContain('[name] should revise');
    expect(data.messages).toEqual([
      {
        role: 'user',
        content:
          'I am [name], @[username], email [email]. The uploaded file is [name] for [name].',
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
    expect(serialized).not.toContain('Maria Rivera essay.pdf');
    expect(serialized).not.toContain('Maria Rivera notes.pdf');
    expect(serialized).not.toContain('fileName');
    expect(serialized).not.toContain('originalFilename');
    expect(serialized).not.toContain('maria.rivera@example.edu');
    expect(serialized).not.toContain('org-1');
    expect(serialized).not.toContain('mem-1');
    expect(serialized).not.toContain('req-1');
    expect(serialized).not.toContain(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );
    expect(serialized).not.toContain('ipHash');
    expect(serialized).not.toContain('czzzzzzzzzzzzzzzzzzzz');
    expect(serialized).not.toContain('student-1');
  });
});
