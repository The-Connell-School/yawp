import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  deriveConversationTitle,
  type GeneratorHistoryClient,
  isGeneratorHistoryEnabled,
  listConversations,
  loadConversation,
  MAX_CONVERSATION_TITLE_LENGTH,
  MAX_HISTORY_CONVERSATIONS,
  recordExchange,
} from './generator-history.server';

const findMany = mock();
const findFirst = mock();
const create = mock();
const update = mock();
const createMany = mock();

// Injected rather than registered with mock.module: Bun's module mocks are a
// global registry keyed by file path, so a mock of this module in another test
// file would otherwise silently replace the real one under these tests.
const client = {
  thesisPromptGeneratorConversation: { findMany, findFirst, create, update },
  thesisPromptGeneratorTurn: { createMany },
} as unknown as GeneratorHistoryClient;

const FLAG = 'THESIS_PROMPT_GENERATOR_HISTORY_ENABLED';
const previousFlag = process.env[FLAG];

beforeEach(() => {
  [findMany, findFirst, create, update, createMany].forEach((m) => m.mockReset());
  process.env[FLAG] = 'true';
});

afterEach(() => {
  if (previousFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previousFlag;
});

describe('isGeneratorHistoryEnabled', () => {
  test('is opt-in, so the generator is unchanged until we turn it on', () => {
    expect(isGeneratorHistoryEnabled({})).toBe(false);
    expect(isGeneratorHistoryEnabled({ [FLAG]: 'false' })).toBe(false);
    expect(isGeneratorHistoryEnabled({ [FLAG]: 'true' })).toBe(true);
  });
});

describe('deriveConversationTitle', () => {
  test('uses the teacher’s opening ask, with whitespace collapsed', () => {
    expect(deriveConversationTitle('  A prompt about\n ambition  ')).toBe(
      'A prompt about ambition'
    );
  });

  test('truncates long asks on a word boundary', () => {
    const title = deriveConversationTitle(
      'A thesis-driven essay prompt about ambition and its costs for tenth graders who are reading Macbeth this term'
    );
    expect(title.length).toBeLessThanOrEqual(MAX_CONVERSATION_TITLE_LENGTH + 1);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toContain('  ');
    // Cut between words, not mid-word.
    expect(title.slice(0, -1).trim().split(' ').pop()).not.toBe('grade');
  });

  test('falls back for an empty ask', () => {
    expect(deriveConversationTitle('   ')).toBe('Untitled');
  });
});

describe('listConversations', () => {
  test('returns the teacher’s conversations newest first, capped', async () => {
    findMany.mockResolvedValue([
      {
        id: 'conv-1',
        title: 'Macbeth and ambition',
        updatedAt: new Date('2026-07-20T10:00:00.000Z'),
        _count: { turns: 4 },
      },
    ]);

    const result = await listConversations('teacher-1', client);

    expect(result).toEqual([
      {
        id: 'conv-1',
        title: 'Macbeth and ambition',
        updatedAt: '2026-07-20T10:00:00.000Z',
        turnCount: 4,
      },
    ]);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ membershipId: 'teacher-1', deletedAt: null });
    expect(args.orderBy).toEqual({ updatedAt: 'desc' });
    expect(args.take).toBe(MAX_HISTORY_CONVERSATIONS);
  });

  test('reads as empty when the flag is off, without touching the database', async () => {
    process.env[FLAG] = 'false';
    expect(await listConversations('teacher-1', client)).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  test('degrades to empty when the query fails', async () => {
    findMany.mockRejectedValue(new Error('db down'));
    expect(await listConversations('teacher-1', client)).toEqual([]);
  });
});

describe('loadConversation', () => {
  test('replays turns in order and validates stored options', async () => {
    findFirst.mockResolvedValue({
      id: 'conv-1',
      title: 'Macbeth and ambition',
      updatedAt: new Date('2026-07-20T10:00:00.000Z'),
      turns: [
        { role: 'user', content: 'A prompt about ambition', options: null },
        {
          role: 'assistant',
          content: 'Here are three drafts.',
          options: [
            { title: 'Ambition and Its Costs', body: 'Write a…' },
            { title: 'Missing a body' },
          ],
        },
      ],
    });

    const result = await loadConversation('conv-1', 'teacher-1', client);

    expect(result?.turns).toHaveLength(2);
    expect(result?.turns[0]).toEqual({
      role: 'user',
      content: 'A prompt about ambition',
      options: [],
    });
    // The malformed option is dropped rather than reaching the UI.
    expect(result?.turns[1].options).toEqual([
      { title: 'Ambition and Its Costs', body: 'Write a…' },
    ]);
  });

  test('scopes the read to the requesting teacher', async () => {
    findFirst.mockResolvedValue(null);

    expect(await loadConversation('someone-elses-conv', 'teacher-1', client)).toBeNull();
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 'someone-elses-conv',
      membershipId: 'teacher-1',
      deletedAt: null,
    });
  });

  test('drops turns with an unrecognized role', async () => {
    findFirst.mockResolvedValue({
      id: 'conv-1',
      title: 'x',
      updatedAt: new Date('2026-07-20T10:00:00.000Z'),
      turns: [{ role: 'system', content: 'nope', options: null }],
    });

    expect((await loadConversation('conv-1', 'teacher-1', client))?.turns).toEqual([]);
  });
});

describe('recordExchange', () => {
  const exchange = {
    membershipId: 'teacher-1',
    teacherMessage: 'A prompt about ambition',
    reply: 'Here are three drafts.',
    options: [{ title: 'Ambition and Its Costs', body: 'Write a…' }],
  };

  test('creates the conversation and both turns on the first exchange', async () => {
    create.mockResolvedValue({ id: 'conv-new' });

    const id = await recordExchange({ ...exchange, client });

    expect(id).toBe('conv-new');
    expect(create.mock.calls[0][0].data).toEqual({
      membershipId: 'teacher-1',
      title: 'A prompt about ambition',
    });
    const turns = createMany.mock.calls[0][0].data;
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({
      conversationId: 'conv-new',
      role: 'user',
      content: 'A prompt about ambition',
    });
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].options).toEqual(exchange.options);
  });

  test('appends to an existing conversation the teacher owns', async () => {
    findFirst.mockResolvedValue({ id: 'conv-1' });

    const id = await recordExchange({ ...exchange, conversationId: 'conv-1', client });

    expect(id).toBe('conv-1');
    expect(create).not.toHaveBeenCalled();
    expect(createMany.mock.calls[0][0].data[0].conversationId).toBe('conv-1');
    // Bumped so the history list orders by most recent activity.
    expect(update.mock.calls[0][0].where).toEqual({ id: 'conv-1' });
  });

  test('starts a fresh conversation when the id is not the teacher’s', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'conv-new' });

    const id = await recordExchange({ ...exchange, conversationId: 'someone-elses-conv', client });

    expect(id).toBe('conv-new');
    expect(createMany.mock.calls[0][0].data[0].conversationId).toBe('conv-new');
  });

  test('omits options entirely for a clarifying question', async () => {
    create.mockResolvedValue({ id: 'conv-new' });

    await recordExchange({ ...exchange, options: [], client });

    expect(createMany.mock.calls[0][0].data[1].options).toBeUndefined();
  });

  test('saves nothing when the flag is off', async () => {
    process.env[FLAG] = 'false';
    expect(await recordExchange({ ...exchange, client })).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  test('never throws into the request path when the write fails', async () => {
    create.mockRejectedValue(new Error('db down'));
    expect(await recordExchange({ ...exchange, client })).toBeNull();
  });
});
