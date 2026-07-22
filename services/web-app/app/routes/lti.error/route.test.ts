import { describe, expect, test } from 'bun:test';
import { loader } from './route';

describe('safe LTI error route', () => {
  test('ignores attacker-controlled and internal cause query values', async () => {
    const response = loader();
    expect(await response.json()).toEqual({ supportCode: 'LTI-100' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
