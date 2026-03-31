import { describe, it, expect } from 'bun:test';
import { contentHash } from './content-hash';

describe('contentHash', () => {
  it('returns a hex string for given content', async () => {
    const hash = await contentHash('<p>hello</p>', 'hello');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same content', async () => {
    const a = await contentHash('<p>test</p>', 'test');
    const b = await contentHash('<p>test</p>', 'test');
    expect(a).toBe(b);
  });

  it('returns different hashes for different content', async () => {
    const a = await contentHash('<p>hello</p>', 'hello');
    const b = await contentHash('<p>world</p>', 'world');
    expect(a).not.toBe(b);
  });
});
