import { expect, mock, test } from 'bun:test';

const findMany = mock(async () => [
  { kind: 'QUESTION', topic: 'ap-history', kinds: [], subjects: [], topics: [] },
  { kind: 'QUESTION', topic: 'ap-history', kinds: ['QUESTION'], subjects: [], topics: ['ap-history', 'grading'] },
  { kind: 'QUESTION', topic: 'grading', kinds: ['QUESTION'], subjects: [], topics: ['grading', 'reporter'] },
  { kind: 'SHARE', topic: 'other', kinds: [], subjects: [], topics: [] },
]);
mock.module('~/utils/db.server', () => ({ prisma: { loungePost: { findMany } } }));
const { listLoungeTopicCounts } = await import('./lounge.server');

test('feed filters never expose retired topic keys from existing posts', async () => {
  expect(await listLoungeTopicCounts({ userId: 'teacher', isStaff: false })).toEqual([
    { topic: 'grading', label: 'Grading & Rubrics', count: 2 },
    { topic: 'reporter', label: 'Reporter', count: 1 },
    { topic: 'other', label: 'Something else', count: 1 },
  ]);
});
