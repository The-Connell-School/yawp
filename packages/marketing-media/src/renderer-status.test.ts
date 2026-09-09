import { describe, expect, test } from 'bun:test';
import { parseRendererStatus, RENDERER_STATUS_FILE } from './renderer-status';

const now = new Date('2026-09-09T12:00:00Z');
const at = (secondsAgo: number) =>
  new Date(now.getTime() - secondsAgo * 1000).toISOString();

describe('parseRendererStatus', () => {
  // The operator's question is "can this thing film right now". A renderer
  // that cannot start has always known why; until now only the container log
  // knew, so a blocked preview looked identical to a busy one.
  test('reports a renderer that is ready', () => {
    const status = parseRendererStatus(
      JSON.stringify({ state: 'ready', at: at(5), workerId: 'embedded-web-1' }),
      now
    );
    expect(status).toMatchObject({ state: 'ready', stale: false });
  });

  test('carries the reason a renderer is blocked', () => {
    const status = parseRendererStatus(
      JSON.stringify({
        state: 'blocked',
        at: at(10),
        reason: 'missing system library libnss3.so',
      }),
      now
    );
    expect(status).toMatchObject({
      state: 'blocked',
      reason: 'missing system library libnss3.so',
    });
  });

  // A file left behind by a container that has since died is not a renderer.
  test('goes stale when nobody has checked in', () => {
    expect(parseRendererStatus(JSON.stringify({ state: 'ready', at: at(600) }), now))
      .toMatchObject({ state: 'ready', stale: true });
  });

  test('treats a missing or unreadable file as no renderer at all', () => {
    expect(parseRendererStatus(null, now)).toBeNull();
    expect(parseRendererStatus('not json', now)).toBeNull();
    expect(parseRendererStatus(JSON.stringify({ state: 'wat', at: at(1) }), now)).toBeNull();
  });

  test('names the file both sides agree on', () => {
    expect(RENDERER_STATUS_FILE).toBe('renderer-status.json');
  });
});
