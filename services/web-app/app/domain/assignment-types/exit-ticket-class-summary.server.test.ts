import { describe, expect, mock, test } from 'bun:test';
import {
  generateExitTicketClassSummary,
  storedExitTicketSummary,
  type ExitTicketSummaryDependencies,
} from './exit-ticket-class-summary.server';
import {
  exitTicketResponsesFingerprint,
  exitTicketSummaryFixture,
} from './exit-ticket-class-summary';

const SUMMARY = {
  understood: 'Most of the class knows Allie is Holden’s brother.',
  confusions: [{ point: 'Some mix Allie up with D.B.', share: 'some' }],
  reteach: 'quick-review',
  reteachReason: 'The brothers are getting mixed up.',
  nextLessonMove: { title: 'Family map', minutes: 8, detail: 'Draw it.' },
};

const RESPONSES = [
  { studentName: 'Ana', rubricScores: null, text: 'His brother who died.' },
  { studentName: 'Ben', rubricScores: null, text: 'Allie is D.B.' },
  { studentName: 'Cy', rubricScores: null, text: 'A kid from school?' },
];

function deps(
  overrides: Partial<ExitTicketSummaryDependencies> = {}
): ExitTicketSummaryDependencies {
  return {
    findTicket: mock(async () => ({
      id: 'ca-1',
      classId: 'class-1',
      assignment: {
        title: 'Exit ticket: Allie',
        prompt: 'Who is Allie?',
        exitTicketConfigJson: null,
        assignmentType: { kind: 'exit_ticket' },
      },
    })),
    loadResponses: mock(async () => RESPONSES),
    findSummary: mock(async () => null),
    saveSummary: mock(async () => {}),
    reserve: mock(async () => {}),
    complete: mock(async () => JSON.stringify(SUMMARY)),
    usesFixture: () => false,
    ...overrides,
  };
}

const INPUT = {
  classAssignmentId: 'ca-1',
  organizationId: 'org-1',
  membershipId: 'teacher-1',
};

describe('generateExitTicketClassSummary', () => {
  test('reads the responses, never the names, and stores the summary', async () => {
    const d = deps();
    const result = await generateExitTicketClassSummary(INPUT, d);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.summary.summary.reteach).toBe('quick-review');
    expect(result.summary.current).toBe(true);
    expect(result.summary.responseCount).toBe(3);

    const [{ user, system }] = (d.complete as ReturnType<typeof mock>).mock
      .calls[0] as [{ user: string; system: string }];
    expect(user).toContain('Allie is D.B.');
    for (const name of ['Ana', 'Ben', 'Cy']) {
      expect(user).not.toContain(name);
      expect(system).not.toContain(name);
    }
    expect(d.reserve).toHaveBeenCalledTimes(1);
    expect(d.saveSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        classAssignmentId: 'ca-1',
        responseCount: 3,
        inputFingerprint: exitTicketResponsesFingerprint(RESPONSES),
        generatedByMembershipId: 'teacher-1',
      })
    );
  });

  test('returns the stored summary without a model call when nothing is new', async () => {
    const d = deps({
      findSummary: mock(async () => ({
        summaryJson: SUMMARY,
        responseCount: 3,
        inputFingerprint: exitTicketResponsesFingerprint(RESPONSES),
        generatedAt: new Date('2026-11-02T15:00:00Z'),
      })),
    });
    const result = await generateExitTicketClassSummary(INPUT, d);
    expect(result.success).toBe(true);
    expect(d.complete).not.toHaveBeenCalled();
    expect(d.reserve).not.toHaveBeenCalled();
  });

  test('waits for a few responses', async () => {
    const d = deps({ loadResponses: mock(async () => RESPONSES.slice(0, 2)) });
    const result = await generateExitTicketClassSummary(INPUT, d);
    expect(result).toMatchObject({ success: false, status: 400 });
    expect(d.complete).not.toHaveBeenCalled();
  });

  test('is only for exit tickets', async () => {
    const d = deps({
      findTicket: mock(async () => ({
        id: 'ca-1',
        classId: 'class-1',
        assignment: {
          title: 'Essay',
          prompt: 'Write.',
          exitTicketConfigJson: null,
          assignmentType: { kind: 'essay' },
        },
      })),
    });
    expect(await generateExitTicketClassSummary(INPUT, d)).toMatchObject({
      success: false,
      status: 404,
    });
  });

  test('says so when the model answer cannot be read, and stores nothing', async () => {
    const d = deps({ complete: mock(async () => 'not json at all') });
    const result = await generateExitTicketClassSummary(INPUT, d);
    expect(result).toMatchObject({ success: false, status: 502 });
    expect(d.saveSummary).not.toHaveBeenCalled();
  });

  test('uses the fixture without a model key', async () => {
    const d = deps({ usesFixture: () => true });
    const result = await generateExitTicketClassSummary(INPUT, d);
    expect(result.success).toBe(true);
    expect(d.complete).not.toHaveBeenCalled();
    if (result.success) {
      expect(result.summary.summary).toEqual(
        exitTicketSummaryFixture(RESPONSES.map((r) => r.text))
      );
    }
  });

  test('a rate limit is a 429, not a failure to summarize', async () => {
    class AiRateLimitError extends Error {
      retryAfterSeconds = 30;
    }
    const d = deps({
      reserve: mock(async () => {
        throw new AiRateLimitError('slow down');
      }),
      isRateLimit: (error: unknown) => error instanceof AiRateLimitError,
    });
    expect(await generateExitTicketClassSummary(INPUT, d)).toMatchObject({
      success: false,
      status: 429,
    });
  });
});

describe('storedExitTicketSummary', () => {
  const row = {
    summaryJson: SUMMARY,
    responseCount: 3,
    inputFingerprint: 'fp-1',
    generatedAt: new Date('2026-11-02T15:00:00Z'),
  };

  test('is current only while the responses are the ones it read', () => {
    expect(storedExitTicketSummary(row, 'fp-1')?.current).toBe(true);
    expect(storedExitTicketSummary(row, 'fp-2')?.current).toBe(false);
  });

  test('a row that no longer reads as a summary is no summary', () => {
    expect(
      storedExitTicketSummary({ ...row, summaryJson: { nope: true } }, 'fp-1')
    ).toBeNull();
    expect(storedExitTicketSummary(null, 'fp-1')).toBeNull();
  });
});
