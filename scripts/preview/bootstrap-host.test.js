import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const script = readFileSync(path.join(import.meta.dir, 'bootstrap-host.sh'), 'utf8');

describe('bootstrap-host.sh', () => {
  test('does not recursively chown the lifecycle-managed preview root', () => {
    expect(script).not.toContain('chown -R "$USER":"$USER" "$ROOT"');
    expect(script).toContain('"$ROOT/previews"');
    expect(script).toContain('"$ROOT/sources"');
    expect(script).toContain('"$ROOT/wake/access"');
  });
});
