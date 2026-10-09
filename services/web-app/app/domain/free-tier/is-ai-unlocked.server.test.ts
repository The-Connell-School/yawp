import { expect, test } from 'bun:test';
import { isAiUnlocked } from './is-ai-unlocked.server';

test('SCHOOL plan is always unlocked', async () => {
  expect(await isAiUnlocked({ id: 'x', plan: 'SCHOOL' })).toBe(true);
});
