import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function activity(human, startedAt, deploy = '99999') {
  const root = mkdtempSync(path.join(tmpdir(), 'preview-activity-')); roots.push(root);
  const dir = path.join(root, 'previews/pr-100'); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n');
  if (human !== null) writeFileSync(path.join(dir, 'last-human-activity'), `${human}\n`);
  writeFileSync(path.join(dir, 'last-deploy'), `${deploy}\n`);
  writeFileSync(path.join(dir, 'last-request'), '999999\n');
  const docker = path.join(root, 'docker');
  writeFileSync(docker, '#!/bin/bash\nif [[ "$1" == ps ]]; then echo container-100; else printf "%s\\n" "$STARTED_AT"; fi\n');
  chmodSync(docker, 0o755);
  const result = spawnSync('bash', ['-c', 'source "$POLICY"; preview_activity_epoch "$PREVIEW_ROOT" 100'], {
    encoding: 'utf8', env: { ...process.env, POLICY: path.join(import.meta.dir, 'idle-policy.sh'), PREVIEW_ROOT: root, DOCKER: docker, STARTED_AT: startedAt },
  });
  expect(result.status).toBe(0);
  return Number(result.stdout.trim());
}
test('recorded human activity wins even over newer container start, deploy, and request times', () => {
  expect(activity('10', '1970-01-01T00:00:20Z')).toBe(10);
});
test('missing, zero, and corrupt activity use actual web container start time', () => {
  for (const human of [null, '0', 'invalid']) expect(activity(human, '1970-01-01T00:00:20.555Z')).toBe(20);
});
test('legacy compose start metadata is the fallback when the web start cannot be read', () => {
  expect(activity(null, '', '30')).toBe(30);
});
