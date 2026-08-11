import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dir, 'remove-preview-path.sh');
const roots = [];

function makeTree(slug = 'pr-42') {
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-preview-remove-'));
  roots.push(root);
  const target = path.join(root, 'sources', slug);
  mkdirSync(path.join(root, 'previews'), { recursive: true });
  mkdirSync(path.join(target, 'services/web-app/.react-router/types'), {
    recursive: true,
  });
  writeFileSync(
    path.join(target, 'services/web-app/.react-router/types/routes.ts'),
    'export {}\n'
  );
  return { root, target };
}

function makeStub(root, name, body) {
  const stub = path.join(root, `${name}.sh`);
  const log = path.join(root, `${name}.log`);
  writeFileSync(
    stub,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\n${body}\n`
  );
  chmodSync(stub, 0o755);
  return { stub, log };
}

function runRemove(root, target, env = {}) {
  return Bun.spawnSync({
    cmd: [
      'bash',
      '-lc',
      `source ${JSON.stringify(script)}; preview_remove_path "$TARGET" "\${EXPECTED_LEAF:-}"`,
    ],
    env: {
      ...process.env,
      PREVIEW_ROOT: root,
      PREVIEW_REMOVE_DOCKER: 'false',
      TARGET: target,
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function stderrOf(result) {
  return new TextDecoder().decode(result.stderr);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('preview_remove_path', () => {
  test('removes a preview tree owned by the deploy user', () => {
    const { root, target } = makeTree();

    const result = runRemove(root, target);

    expect(result.exitCode).toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  test('succeeds when the safe path is already absent', () => {
    const { root } = makeTree();
    const target = path.join(root, 'previews', 'pr-999');

    const result = runRemove(root, target);

    expect(result.exitCode).toBe(0);
  });

  test('removes an explicitly named environment without broadening the allowlist', () => {
    const { root, target } = makeTree('demo');

    const result = runRemove(root, target, { EXPECTED_LEAF: 'demo' });

    expect(result.exitCode).toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  test('refuses a named environment unless the caller supplies the exact slug', () => {
    const { root, target } = makeTree('demo');

    const result = runRemove(root, target, { EXPECTED_LEAF: 'staging' });

    expect(result.exitCode).toBe(1);
    expect(stderrOf(result)).toContain('Refusing');
    expect(existsSync(target)).toBe(true);
  });

  test('falls back to a root container when plain removal fails', () => {
    const { root, target } = makeTree();
    const { stub, log } = makeStub(
      root,
      'docker',
      'exec rm -rf "$PREVIEW_REMOVE_DOCKER_TARGET"'
    );

    const result = runRemove(root, target, {
      PREVIEW_REMOVE_RM: 'false',
      PREVIEW_REMOVE_DOCKER: stub,
      PREVIEW_REMOVE_DOCKER_TARGET: target,
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(target)).toBe(false);
    expect(readFileSync(log, 'utf8')).toContain('run --rm --user 0:0');
    expect(readFileSync(log, 'utf8')).toContain(
      `${path.join(root, 'sources')}:/target`
    );
  });

  test('reports failure when every removal layer leaves the tree behind', () => {
    const { root, target } = makeTree();

    const result = runRemove(root, target, {
      PREVIEW_REMOVE_RM: 'false',
    });

    expect(result.exitCode).toBe(1);
    expect(existsSync(target)).toBe(true);
    expect(stderrOf(result)).toContain(target);
  });

  test('refuses a matching slug outside the configured preview root', () => {
    const { root } = makeTree();
    const target = path.join(root, 'elsewhere', 'pr-42');
    mkdirSync(target, { recursive: true });

    const result = runRemove(root, target);

    expect(result.exitCode).toBe(1);
    expect(stderrOf(result)).toContain('Refusing');
    expect(existsSync(target)).toBe(true);
  });

  test('refuses traversal into a different parent', () => {
    const { root } = makeTree();
    const outside = path.join(root, 'outside', 'pr-42');
    mkdirSync(outside, { recursive: true });
    const target = path.join(root, 'previews', '..', 'outside', 'pr-42');

    const result = runRemove(root, target);

    expect(result.exitCode).toBe(1);
    expect(stderrOf(result)).toContain('Refusing');
    expect(existsSync(outside)).toBe(true);
  });

  test('refuses malformed slugs and broad paths', () => {
    const { root } = makeTree();

    for (const target of [root, '/', path.join(root, 'sources', 'pr-0')]) {
      const result = runRemove(root, target);
      expect(result.exitCode).toBe(1);
      expect(stderrOf(result)).toContain('Refusing');
    }
  });
});
