#!/usr/bin/env node
// Usage: check-vite-deps.mjs <deps-dir> [expected-lockfile-hash]
//
// Exits 0 iff <deps-dir> is a self-consistent Vite optimizeDeps cache. Vite accepts
// _metadata.json when lockfileHash and configHash match without stat-ing chunks; a torn
// copy 404s in every browser tab. This validates before and after every copy.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const [dir, expectedLockfileHash] = process.argv.slice(2);

function fail(message) {
  console.error(`vite deps cache at ${dir ?? '<no dir>'}: ${message}`);
  process.exit(1);
}

if (!dir) fail('no directory given');
if (!existsSync(dir) || !statSync(dir).isDirectory()) fail('not a directory');

const metadataPath = path.join(dir, '_metadata.json');
if (!existsSync(metadataPath)) fail('_metadata.json is missing');

if (!existsSync(path.join(dir, 'package.json'))) fail('package.json is missing');

let metadata;
try {
  metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
} catch (error) {
  fail(`_metadata.json did not parse (${error.message})`);
}

if (expectedLockfileHash && metadata.lockfileHash !== expectedLockfileHash) {
  fail(
    `lockfileHash is ${JSON.stringify(metadata.lockfileHash)}, expected ` +
      `${JSON.stringify(expectedLockfileHash)}`,
  );
}

const entries = { ...(metadata.optimized ?? {}), ...(metadata.chunks ?? {}) };
const names = Object.keys(entries);
if (names.length === 0) fail('_metadata.json lists no optimized deps');

const missing = [];
for (const name of names) {
  const file = entries[name]?.file;
  if (typeof file !== 'string' || file === '') {
    missing.push(`${name} (no file recorded)`);
    continue;
  }
  const resolved = path.isAbsolute(file)
    ? path.join(dir, path.basename(file))
    : path.resolve(dir, file);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    missing.push(`${name} -> ${file}`);
  }
}

if (missing.length > 0) {
  fail(
    `${missing.length} of ${names.length} referenced chunks are missing: ` +
      missing.slice(0, 5).join(', '),
  );
}

console.log(
  `vite deps cache at ${dir}: ok (${names.length} entries, lockfileHash ${metadata.lockfileHash})`,
);
