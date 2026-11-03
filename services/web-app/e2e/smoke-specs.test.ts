import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_SMOKE_SHARDS, E2E_SMOKE_SPECS, type SmokeShard } from './smoke-specs.ts';

const webAppRoot = join(import.meta.dir, '..');

describe('E2E smoke shard assignment', () => {
  test('CI shards are numbered 1 through 6', () => {
    for (let shard = 1; shard <= 6; shard += 1) {
      expect(E2E_SMOKE_SHARDS[shard as SmokeShard].length).toBeGreaterThan(0);
    }
  });

  test('union of shards equals the canonical smoke list exactly once', () => {
    const fromShards: string[] = [];
    for (let shard = 1; shard <= 6; shard += 1) {
      fromShards.push(...E2E_SMOKE_SHARDS[shard as SmokeShard]);
    }
    expect(fromShards.length).toBe(E2E_SMOKE_SPECS.length);
    expect(new Set(fromShards).size).toBe(E2E_SMOKE_SPECS.length);
    expect([...fromShards].sort()).toEqual([...E2E_SMOKE_SPECS].sort());
  });

  test('every smoke spec path exists under services/web-app', () => {
    for (const spec of E2E_SMOKE_SPECS) {
      expect(existsSync(join(webAppRoot, spec))).toBe(true);
    }
  });
});
