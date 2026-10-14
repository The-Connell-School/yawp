import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { seedLegacyPreviewMetadata } from './wake-server.mjs';
const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
test('legacy metadata seed uses container start and existing activity once without container mutations', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'preview-metadata-')); roots.push(root);
  const dir = path.join(root, 'previews/pr-484'); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n');
  utimesSync(path.join(dir, 'docker-compose.yml'), new Date('2026-10-13'), new Date('2026-10-13'));
  writeFileSync(path.join(dir, 'last-request'), '1700000000\n');
  const calls = [];
  const execFileFn = async (command, args) => {
    calls.push([command, ...args]); return { stdout: '2026-10-14T01:39:16.555Z\n' };
  };
  await seedLegacyPreviewMetadata({ root, execFileFn });
  expect(readFileSync(path.join(dir, 'last-human-activity'), 'utf8')).toBe('1700000000\n');
  const deploy = readFileSync(path.join(dir, 'last-deploy'), 'utf8');
  expect(Number(deploy.trim())).toBe(Math.floor(Date.parse('2026-10-14T01:39:16.555Z') / 1000));
  writeFileSync(path.join(dir, 'last-request'), '1792000000\n');
  await seedLegacyPreviewMetadata({ root, execFileFn });
  expect(readFileSync(path.join(dir, 'last-human-activity'), 'utf8')).toBe('1700000000\n');
  expect(readFileSync(path.join(dir, 'last-deploy'), 'utf8')).toBe(deploy);
  expect(calls.every(call => call[1] === 'inspect')).toBe(true);
});
