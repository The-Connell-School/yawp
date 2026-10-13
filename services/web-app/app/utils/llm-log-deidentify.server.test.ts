import { describe, expect, test } from 'bun:test';
import { deidentifyLlmLogData } from './llm-log-deidentify.server';

describe('LlmLog de-identification', () => {
  test('scrubs structured identifiers and feasible in-text PII while keeping prompt and response text', () => {
    const data = deidentifyLlmLogData({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      systemPrompt:
        'Help Maria Rivera at maria.rivera@example.edu with class cmabc12345678901234567890 for membership mem-1, IP hash 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef, phone 555-867-5309, SSN 123-45-6789, and user czzzzzzzzzzzzzzzzzzzz.',
      messages: [
        {
          role: 'user',
          name: 'mrivera',
          fileName: 'Maria Rivera essay.pdf',
          content:
            'I am Maria Rivera, @mrivera, email maria.rivera@example.edu, and phone (555) 867-5309. The uploaded file is Maria Rivera essay.pdf for org-1.',
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
    expect(data.systemPrompt).toContain('phone [phone], SSN [id]');
    expect(data.response).toContain('[name] should revise');
    expect(data.messages).toEqual([
      {
        role: 'user',
        content:
          'I am [name], @[username], email [email], and phone [phone]. The uploaded file is [name] for [name].',
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
    expect(serialized).not.toContain('555-867-5309');
    expect(serialized).not.toContain('(555) 867-5309');
    expect(serialized).not.toContain('123-45-6789');
  });

  test('scrubs free-form student names from prompt and response text', () => {
    const data = deidentifyLlmLogData({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      systemPrompt:
        'Student first name: Jordan\nIn overallComment, start with "Jordan," and continue with feedback.',
      messages: [
        {
          role: 'user',
          content:
            'My name is Jane Student. I am Jane Student and this draft is by Jane Student.',
        },
        {
          role: 'user',
          content:
            'The author Jane Student argues that lunch should be longer.',
        },
      ],
      response:
        '{"overallComment":"Jordan, revise your claim."}\nJane Student, keep developing evidence.\nJane, add one more source.\nThe student should keep the conclusion focused.',
      metadata: {
        feature: 'grading',
        kind: 'rubric-evaluation',
      },
      deidentificationPhrases: ['Jane Student', 'Jordan'],
    });

    const serialized = JSON.stringify(data);

    expect(data.systemPrompt).toContain('Student first name: [name]');
    expect(data.systemPrompt).toContain('start with "[name],"');
    expect(data.messages).toEqual([
      {
        role: 'user',
        content: 'My name is [name]. I am [name] and this draft is by [name].',
      },
      {
        role: 'user',
        content: 'The author [name] argues that lunch should be longer.',
      },
    ]);
    expect(data.response).toContain('"overallComment":"[name],');
    expect(data.response).toContain('[name], keep developing evidence.');
    expect(data.response).toContain('[name], add one more source.');
    expect(data.response).toContain(
      'The student should keep the conclusion focused.'
    );
    expect(serialized).not.toContain('Jane Student');
    expect(serialized).not.toContain('Jordan');
    expect(serialized).not.toContain('deidentificationPhrases');
  });

  test('scrubs raw IP addresses and standalone hash values from text', () => {
    const hash =
      'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const data = deidentifyLlmLogData({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      systemPrompt: `Handle request from 203.0.113.42 with digest ${hash}.`,
      messages: [
        {
          role: 'user',
          content: `Client IP 198.51.100.20 and content hash ${hash}`,
        },
      ],
      response: `No raw 203.0.113.42 or ${hash} should persist.`,
      metadata: {
        feature: 'tutor',
      },
    });

    const serialized = JSON.stringify(data);

    expect(data.systemPrompt).toContain('from [ip] with digest [hash]');
    expect(data.messages).toEqual([
      {
        role: 'user',
        content: 'Client IP [ip] and content hash [hash]',
      },
    ]);
    expect(data.response).toContain('No raw [ip] or [hash]');
    expect(serialized).not.toContain('203.0.113.42');
    expect(serialized).not.toContain('198.51.100.20');
    expect(serialized).not.toContain(hash);
  });
});
