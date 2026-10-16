import { expect, test } from 'bun:test';
import { createPrStateLookup } from './pr-state.mjs';
test('closed PRs and GitHub failures fail closed; open state expires and lookups coalesce', async () => {
  let now = 0; let calls = 0; let state = 'open';
  const lookup = createPrStateLookup({ now: () => now, fetchFn: async () => {
    calls++; return { ok: true, json: async () => ([{ number: 508, state, head: { ref: 'codex/lane' }, user: { login: 'author' } }]) };
  } });
  expect((await Promise.all([lookup(508), lookup(508)])).map(pr => pr.state)).toEqual(['open', 'open']);
  expect(await lookup(506)).toBe(null);
  expect(calls).toBe(1);
  now += 301; state = 'closed'; expect(await lookup(508)).toBe(null);
  const failed = createPrStateLookup({ fetchFn: async () => { throw new Error('network'); } });
  expect(await failed(508)).toBe(null);
});
