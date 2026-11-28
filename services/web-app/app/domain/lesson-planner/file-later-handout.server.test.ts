/**
 * A handout asked for after the lesson was built goes into that lesson
 * (13-lesson review, Nov 22). The fixture is the real reply to "Build the
 * student handout for this lesson" from the Macbeth run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const count = mock(async () => 3);
const fileReplyPieces = mock(async ({ onlyKeys }: { onlyKeys: string[] }) => ({ added: onlyKeys.map((key) => `m1:${key}`), skipped: [] }));
mock.module('~/utils/db.server', () => ({ prisma: { lessonPlanMaterial: { count } } }));
mock.module('./file-reply-pieces.server', () => ({ fileReplyPieces }));

const { asksForHandout, fileLaterHandout, handoutKeys } = await import('./file-later-handout.server');
const HANDOUT = readFileSync(join(import.meta.dir, 'fixtures', 'reply-macbeth-handout.md'), 'utf8');
const message = { id: 'm1', createdAt: new Date(), content: HANDOUT };

describe('fileLaterHandout', () => {
  beforeEach(() => {
    count.mockClear();
    fileReplyPieces.mockClear();
  });

  test('the teacher’s words: the suggestion, and the ways a teacher types it; never "from my stack", which builds from the stack itself', () => {
    expect(asksForHandout('Build the student handout for this lesson')).toBe(true);
    expect(asksForHandout('can you make a handout for this?')).toBe(true);
    expect(asksForHandout('Build the student handout from my stack')).toBe(false);
    expect(asksForHandout('Make the exit ticket harder')).toBe(false);
  });

  test('the reply’s handout is found', () => {
    expect(handoutKeys(HANDOUT).length).toBe(1);
  });

  test('asked for, with a lesson already in the stack: filed beside it', async () => {
    const filed = await fileLaterHandout({ conversationId: 'c1', message, teacherMessage: 'Build the student handout for this lesson' });
    expect(fileReplyPieces).toHaveBeenCalledTimes(1);
    expect(fileReplyPieces.mock.calls[0]![0]).toMatchObject({ conversationId: 'c1', onlyKeys: handoutKeys(HANDOUT) });
    expect(filed).toEqual(handoutKeys(HANDOUT).map((key) => `m1:${key}`));
  });

  test('nothing in the stack yet, or not asked for: the card waits for the teacher', async () => {
    count.mockResolvedValueOnce(0);
    expect(await fileLaterHandout({ conversationId: 'c1', message, teacherMessage: 'Build the student handout for this lesson' })).toEqual([]);
    expect(await fileLaterHandout({ conversationId: 'c1', message, teacherMessage: 'Make it shorter' })).toEqual([]);
    expect(fileReplyPieces).not.toHaveBeenCalled();
  });
});
