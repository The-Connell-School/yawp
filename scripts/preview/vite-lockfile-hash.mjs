#!/usr/bin/env node
// Mirrors Vite 5's getLockfileHash(config): sha256(content).slice(0, 8), where content is
// the first lockfile found walking up from services/web-app, read as utf-8, plus patches/
// mtime when the lockfile format uses checkPatches (including bun.lockb).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const LOCKFILE_NAMES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
];

function lookupFile(startDir, names) {
  let dir = startDir;
  while (true) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function getHash(text, length = 8) {
  return createHash('sha256').update(text).digest('hex').substring(0, length);
}

export function viteLockfileHash(sourceDir, webRoot = 'services/web-app') {
  const appRoot = path.join(sourceDir, webRoot);
  const lockfilePath = lookupFile(appRoot, LOCKFILE_NAMES);
  if (!lockfilePath) return '';

  let content = readFileSync(lockfilePath, 'utf-8');
  const lockfileName = path.basename(lockfilePath);
  if (
    lockfileName === 'package-lock.json' ||
    lockfileName === 'yarn.lock' ||
    lockfileName === 'bun.lockb'
  ) {
    const patchesDir = path.join(path.dirname(lockfilePath), 'patches');
    try {
      if (statSync(patchesDir).isDirectory()) {
        content += statSync(patchesDir).mtimeMs.toString();
      }
    } catch {
      // no patches directory
    }
  }
  return getHash(content);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const sourceDir = process.argv[2];
  if (!sourceDir) {
    console.error('usage: vite-lockfile-hash.mjs <source-dir>');
    process.exit(2);
  }
  const hash = viteLockfileHash(sourceDir);
  if (!hash) {
    console.error('no lockfile found');
    process.exit(1);
  }
  process.stdout.write(`${hash}\n`);
}
