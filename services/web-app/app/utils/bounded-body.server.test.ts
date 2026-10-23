import { describe, expect, test } from 'bun:test';
import { readBoundedBytes } from './bounded-body.server';

describe('readBoundedBytes', () => {
  test('refuses a declared length over the cap without reading', async () => {
    const request = new Request('https://example.test/upload', {
      method: 'POST',
      headers: { 'Content-Length': '12000000' },
      body: 'x'.repeat(100),
    });
    expect(await readBoundedBytes(request, 11 * 1024 * 1024)).toBe(null);
  });

  test('counts an undeclared body and stops before the cap is buffered', async () => {
    const request = new Request('https://example.test/upload', {
      method: 'POST',
      body: new Uint8Array(11 * 1024 * 1024 + 1),
    });
    expect(await readBoundedBytes(request, 11 * 1024 * 1024)).toBe(null);
  });
});
