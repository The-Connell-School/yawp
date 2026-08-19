import { describe, expect, test } from 'bun:test';
import type { ContributionMember } from './contribution.server';
import {
  buildSuggestionPrompt,
  collectMemberWriting,
  fieldsForSuggestion,
  parseSuggestions,
  SUGGESTION_SYSTEM_PROMPT,
} from './member-grade-suggestions';

function member(overrides: Partial<ContributionMember> = {}): ContributionMember {
  return {
    membershipId: 'm1',
    name: 'Fen Zhao',
    survivingChars: 120,
    survivingShare: 40,
    charsInserted: 200,
    charsDeleted: 30,
    sessionCount: 3,
    updateCount: 12,
    firstSeenAt: '2026-05-01T10:00:00.000Z',
    lastSeenAt: '2026-05-03T10:00:00.000Z',
    hasWritten: true,
    ...overrides,
  };
}

describe('collectMemberWriting', () => {
  test('gives each member the text they wrote, in draft order', () => {
    const members = [
      member({ membershipId: 'm1', name: 'Fen' }),
      member({ membershipId: 'm2', name: 'Dara' }),
    ];
    const paragraphs = [
      [
        { membershipId: 'm1', text: 'Our expansion targets Lisbon. ' },
        { membershipId: 'm2', text: 'Rent there is half of Dublin.' },
      ],
      [{ membershipId: 'm1', text: 'Hiring is the risk.' }],
    ];

    expect(collectMemberWriting({ members, paragraphs })).toEqual([
      {
        member: members[0]!,
        wrote: ['Our expansion targets Lisbon.', 'Hiring is the risk.'],
      },
      { member: members[1]!, wrote: ['Rent there is half of Dublin.'] },
    ]);
  });

  test('includes a member who wrote nothing, rather than dropping them', () => {
    // A student with nothing in the draft is exactly the case a teacher most
    // wants a read on, so they must reach the model.
    const members = [member({ membershipId: 'm1' }), member({ membershipId: 'm2' })];
    const paragraphs = [[{ membershipId: 'm1', text: 'All of it.' }]];

    const collected = collectMemberWriting({ members, paragraphs });

    expect(collected).toHaveLength(2);
    expect(collected[1]?.wrote).toEqual([]);
  });

  test('ignores unattributed and whitespace-only runs', () => {
    const members = [member({ membershipId: 'm1' })];
    const paragraphs = [
      [
        { membershipId: null, text: 'Pasted from the old brief.' },
        { membershipId: 'm1', text: '   ' },
        { membershipId: 'm1', text: 'Real sentence.' },
      ],
    ];

    expect(collectMemberWriting({ members, paragraphs })[0]?.wrote).toEqual([
      'Real sentence.',
    ]);
  });

  test('ignores text from someone no longer on the roster', () => {
    // Removed members still own runs in the document; they have no card to fill.
    const members = [member({ membershipId: 'm1' })];
    const paragraphs = [
      [
        { membershipId: 'gone', text: 'Written before they left.' },
        { membershipId: 'm1', text: 'Mine.' },
      ],
    ];

    const collected = collectMemberWriting({ members, paragraphs });

    expect(collected).toHaveLength(1);
    expect(collected[0]?.wrote).toEqual(['Mine.']);
  });
});

describe('SUGGESTION_SYSTEM_PROMPT', () => {
  test('asks for no override as the normal answer', () => {
    // The whole safety argument for this feature rests on the default being
    // "takes the group grade" rather than a different number for everybody.
    expect(SUGGESTION_SYSTEM_PROMPT).toContain('null when the student should simply take the group grade');
    expect(SUGGESTION_SYSTEM_PROMPT).toContain('This is the normal answer.');
  });

  test('tells the model not to grade by character count', () => {
    expect(SUGGESTION_SYSTEM_PROMPT).toContain('Judge the writing, not the character counts');
  });
});

describe('buildSuggestionPrompt', () => {
  test('carries the brief, the group grade, and each member', () => {
    const prompt = buildSuggestionPrompt({
      assignmentPrompt: 'Plan an expansion into one EU market.',
      groupGrade: '88',
      members: [
        {
          member: member({ membershipId: 'm1', name: 'Fen Zhao' }),
          wrote: ['Lisbon is the cheapest entry.'],
        },
      ],
    });

    expect(prompt).toContain('Plan an expansion into one EU market.');
    expect(prompt).toContain('Group grade for the brief itself: 88');
    expect(prompt).toContain('id: m1');
    expect(prompt).toContain('name: Fen Zhao');
    expect(prompt).toContain('- Lisbon is the cheapest entry.');
  });

  test('says the group is ungraded rather than omitting the line', () => {
    const prompt = buildSuggestionPrompt({
      groupGrade: null,
      members: [{ member: member(), wrote: [] }],
    });

    expect(prompt).toContain('Group grade for the brief itself: (not graded yet)');
  });

  test('states plainly when a member wrote nothing still in the draft', () => {
    const prompt = buildSuggestionPrompt({
      members: [{ member: member({ membershipId: 'm2' }), wrote: [] }],
    });

    expect(prompt).toContain('wrote: (nothing still in the draft)');
  });

  test('gives counts as context alongside the writing', () => {
    const prompt = buildSuggestionPrompt({
      members: [
        {
          member: member({ sessionCount: 4, charsInserted: 900, survivingChars: 700, charsDeleted: 150 }),
          wrote: ['Something.'],
        },
      ],
    });

    expect(prompt).toContain('editing sessions: 4');
    expect(prompt).toContain('characters written: 900');
    expect(prompt).toContain('still in the draft: 700');
    expect(prompt).toContain('removed by them: 150');
  });

  test('omits the assignment prompt block when there is none', () => {
    const prompt = buildSuggestionPrompt({
      assignmentPrompt: '   ',
      members: [{ member: member(), wrote: [] }],
    });

    expect(prompt).not.toContain('Assignment prompt:');
  });
});

describe('parseSuggestions', () => {
  test('reads a well-formed reply', () => {
    const raw = JSON.stringify({
      suggestions: [
        { membershipId: 'm1', score: null, feedback: 'You framed the market case.' },
        { membershipId: 'm2', score: '78', feedback: 'Your section needs sources.' },
      ],
    });

    expect(parseSuggestions({ raw, memberIds: ['m1', 'm2'] })).toEqual([
      { membershipId: 'm1', score: null, feedback: 'You framed the market case.' },
      { membershipId: 'm2', score: '78', feedback: 'Your section needs sources.' },
    ]);
  });

  test('recovers JSON wrapped in prose or a code fence', () => {
    const raw = '```json\n{"suggestions":[{"membershipId":"m1","score":null,"feedback":"Good."}]}\n```';

    expect(parseSuggestions({ raw, memberIds: ['m1'] })).toEqual([
      { membershipId: 'm1', score: null, feedback: 'Good.' },
    ]);
  });

  test('returns nothing rather than throwing on unparseable output', () => {
    // The grading page must render even when no draft could be written.
    expect(parseSuggestions({ raw: 'I could not do that.', memberIds: ['m1'] })).toEqual([]);
    expect(parseSuggestions({ raw: '', memberIds: ['m1'] })).toEqual([]);
    expect(parseSuggestions({ raw: '{"suggestions":"soon"}', memberIds: ['m1'] })).toEqual([]);
  });

  test('drops a suggestion for someone outside the group', () => {
    // Otherwise a suggestion lands on a card that is not that student's.
    const raw = JSON.stringify({
      suggestions: [
        { membershipId: 'intruder', score: '50', feedback: 'No.' },
        { membershipId: 'm1', score: null, feedback: 'Yes.' },
      ],
    });

    expect(parseSuggestions({ raw, memberIds: ['m1'] })).toEqual([
      { membershipId: 'm1', score: null, feedback: 'Yes.' },
    ]);
  });

  test('keeps only the first suggestion for a repeated student', () => {
    const raw = JSON.stringify({
      suggestions: [
        { membershipId: 'm1', score: '90', feedback: 'First.' },
        { membershipId: 'm1', score: '60', feedback: 'Second.' },
      ],
    });

    expect(parseSuggestions({ raw, memberIds: ['m1'] })).toEqual([
      { membershipId: 'm1', score: '90', feedback: 'First.' },
    ]);
  });

  test('treats an empty or non-string score as no override', () => {
    const raw = JSON.stringify({
      suggestions: [
        { membershipId: 'm1', score: '  ', feedback: 'a' },
        { membershipId: 'm2', score: 84, feedback: 'b' },
      ],
    });

    expect(parseSuggestions({ raw, memberIds: ['m1', 'm2'] })).toEqual([
      { membershipId: 'm1', score: null, feedback: 'a' },
      { membershipId: 'm2', score: null, feedback: 'b' },
    ]);
  });

  test('skips rows that are not objects or lack an id', () => {
    const raw = JSON.stringify({
      suggestions: [null, 'nope', { score: '90', feedback: 'orphan' }, { membershipId: 'm1', feedback: 'ok' }],
    });

    expect(parseSuggestions({ raw, memberIds: ['m1'] })).toEqual([
      { membershipId: 'm1', score: null, feedback: 'ok' },
    ]);
  });
});

describe('fieldsForSuggestion', () => {
  const saved = { savedScore: '', savedFeedback: '' };

  test('fills both boxes from the suggestion', () => {
    expect(
      fieldsForSuggestion({
        suggestion: { membershipId: 'm1', score: '82', feedback: 'Strong market case.' },
        ...saved,
      })
    ).toEqual({ score: '82', feedback: 'Strong market case.' });
  });

  test('leaves a typed score alone when the suggestion is "takes the group grade"', () => {
    // Null means no override, not "delete what the teacher entered".
    expect(
      fieldsForSuggestion({
        suggestion: { membershipId: 'm1', score: null, feedback: 'Nice work.' },
        savedScore: '95',
        savedFeedback: '',
      })
    ).toEqual({ score: '95', feedback: 'Nice work.' });
  });

  test('keeps an existing comment when the model wrote none', () => {
    expect(
      fieldsForSuggestion({
        suggestion: { membershipId: 'm1', score: '70', feedback: '   ' },
        savedScore: '',
        savedFeedback: 'Talk to me about the sources.',
      })
    ).toEqual({ score: '70', feedback: 'Talk to me about the sources.' });
  });
});
