import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEPENDENCY_CACHE_SCHEMA = 'v2';
export const PREVIEW_BUN_IMAGE = 'oven/bun:1.3.1';

function workspaceManifests(sourceDir, workspaceRoot) {
  const root = path.join(sourceDir, workspaceRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(workspaceRoot, entry.name, 'package.json'))
    .filter((relativePath) => existsSync(path.join(sourceDir, relativePath)));
}

export function listDependencyInputs(sourceDir) {
  const lockfiles = ['bun.lock', 'bun.lockb'].filter((relativePath) =>
    existsSync(path.join(sourceDir, relativePath)),
  );
  if (lockfiles.length === 0) {
    throw new Error('preview source requires bun.lock or bun.lockb');
  }
  if (!existsSync(path.join(sourceDir, 'package.json'))) {
    throw new Error('preview source requires package.json');
  }

  return [
    ...lockfiles,
    'package.json',
    ...workspaceManifests(sourceDir, 'packages'),
    ...workspaceManifests(sourceDir, 'services'),
  ].sort();
}

export function computeDependencyFingerprint(sourceDir) {
  const hash = createHash('sha256');
  hash.update(`yawp-preview-dependency-cache\0${DEPENDENCY_CACHE_SCHEMA}\0`);
  hash.update(`${PREVIEW_BUN_IMAGE}\0`);
  for (const relativePath of listDependencyInputs(sourceDir)) {
    const contents = readFileSync(path.join(sourceDir, relativePath));
    hash.update(`${relativePath}\0${contents.length}\0`);
    hash.update(contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function cacheVolumeNames(fingerprint) {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new Error(
      'dependency fingerprint must be 64 lowercase hexadecimal characters',
    );
  }
  const prefix = `yawp-preview-deps-${DEPENDENCY_CACHE_SCHEMA}-${fingerprint}`;
  return { root: `${prefix}-root`, web: `${prefix}-web` };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceDir = process.argv[2];
  if (!sourceDir) throw new Error('usage: dependency-cache.mjs SOURCE_DIR');
  const fingerprint = computeDependencyFingerprint(sourceDir);
  const volumes = cacheVolumeNames(fingerprint);
  process.stdout.write(
    [
      `DEPENDENCY_CACHE_FINGERPRINT=${shellQuote(fingerprint)}`,
      `DEPENDENCY_ROOT_VOLUME=${shellQuote(volumes.root)}`,
      `DEPENDENCY_WEB_VOLUME=${shellQuote(volumes.web)}`,
      `PREVIEW_BUN_IMAGE=${shellQuote(PREVIEW_BUN_IMAGE)}`,
    ].join('\n') + '\n',
  );
}
