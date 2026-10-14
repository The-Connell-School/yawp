import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dir, 'check-skip-preview.sh');
const roots = [];

function runGuard(body) {
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-skip-preview-'));
  roots.push(root);
  const bodyFile = path.join(root, 'body.md');
  const outputFile = path.join(root, 'github-output');
  writeFileSync(bodyFile, body);
  writeFileSync(outputFile, '');

  const result = Bun.spawnSync({
    cmd: ['bash', script, bodyFile],
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputFile,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    result,
    output: readFileSync(outputFile, 'utf8'),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('check-skip-preview.sh', () => {
  test('skips when the first PR body line is exactly [skip preview]', () => {
    const { result, output } = runGuard('[skip preview]\n\nSummary\n');

    expect(result.exitCode).toBe(0);
    expect(output).toContain('skip_preview=true');
  });

  test('accepts CRLF bodies from GitHub', () => {
    const { result, output } = runGuard('[skip preview]\r\n\r\nSummary\r\n');

    expect(result.exitCode).toBe(0);
    expect(output).toContain('skip_preview=true');
  });

  test('does not skip when the directive appears below the first line', () => {
    const { result, output } = runGuard('Summary\n[skip preview]\n');

    expect(result.exitCode).toBe(0);
    expect(output).toContain('skip_preview=false');
  });
});
