import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RENDERER_STATUS_FILE } from '../../../../packages/marketing-media';
import { readRendererStatus } from './renderer-status.server';

const dirs: string[] = [];
function mediaDir(contents?: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yawp-media-'));
  dirs.push(dir);
  if (contents !== undefined) {
    fs.writeFileSync(path.join(dir, RENDERER_STATUS_FILE), contents);
  }
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readRendererStatus', () => {
  test('reads what the renderer published', () => {
    const dir = mediaDir(
      JSON.stringify({ state: 'ready', at: new Date().toISOString() })
    );
    expect(readRendererStatus(dir)).toMatchObject({ state: 'ready', stale: false });
  });

  // The failure this exists for: the operator sees jobs queue and nothing
  // happen, and the reason is one line in a container log.
  test('surfaces why a renderer cannot film', () => {
    const dir = mediaDir(
      JSON.stringify({
        state: 'blocked',
        reason: 'missing system library libnss3.so',
        at: new Date().toISOString(),
      })
    );
    expect(readRendererStatus(dir)?.reason).toBe(
      'missing system library libnss3.so'
    );
  });

  test('no file means no renderer has ever run here', () => {
    expect(readRendererStatus(mediaDir())).toBeNull();
  });

  // S3-backed environments have no shared directory to read.
  test('is null when this environment keeps no media directory', () => {
    expect(readRendererStatus(null)).toBeNull();
  });

  test('survives an unreadable directory rather than breaking the page', () => {
    expect(readRendererStatus('/nowhere/at/all')).toBeNull();
  });
});
