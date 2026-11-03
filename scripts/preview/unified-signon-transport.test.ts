import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const workflow = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/preview-environments.yml', import.meta.url), 'utf8')) as any;
const policy = workflow.jobs['preview-policy'].steps[0].run;
for (const action of ['labeled', 'unlabeled']) {
  for (const [label, body, head, base, deploy] of [
    ['preview-flag:unified-sign-on-off', '', 'same', 'main', true],
    ['preview-flag:unified-sign-on-off', '[skip preview]\nBody', 'same', 'main', false],
    ['preview-flag:unified-sign-on-off', '', 'fork', 'main', false],
    ['preview-flag:unified-sign-on-off', '', 'same', 'other', false],
    ['preview-flag:unified-sign-on-off-extra', '', 'same', 'main', false],
    ['other-preview-flag:unified-sign-on-off', '', 'same', 'main', false],
    ['preview-flag:unified-sign-on', '', 'same', 'main', false],
    ['unrelated', '', 'same', 'main', false],
    ['PREVIEW-FLAG:UNIFIED-SIGN-ON-OFF', '', 'same', 'main', false],
    ['sanitized-production-data', '', 'same', 'main', true],
  ]) {
    test(`live policy ${action} ${label}, skip=${!!body}, head=${head}, base=${base}`, () => {
      const root = mkdtempSync(join(tmpdir(), 'signon-policy-'));
      try {
        writeFileSync(join(root, 'gh'), '#!/bin/bash\nprintf "%s" "$PR_FIXTURE"\n', { mode: 0o755 });
        const output = join(root, 'output');
        execFileSync('bash', ['-c', policy], { env: {
          ...process.env, PATH: `${root}:${process.env.PATH}`, PR_NUMBER: '565', EVENT_ACTION: action as string,
          EVENT_LABEL: label as string, DEFAULT_BRANCH: 'main', EVENT_HEAD_REPOSITORY: head as string,
          GITHUB_REPOSITORY: 'same', GITHUB_OUTPUT: output, RUNNER_TEMP: root,
          PR_FIXTURE: JSON.stringify({ title: 'Fixture', body, headRefName: 'qa/fixture', baseRefName: base, labels: action === 'labeled' ? [{ name: label }] : [] }),
        } });
        expect(readFileSync(output, 'utf8')).toContain(`should_deploy=${deploy}`);
        expect(readFileSync(output, 'utf8')).toContain(`unified_sign_on=${!(action === 'labeled' && label === 'preview-flag:unified-sign-on-off')}`);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
}

for (const runtime of ['fast', 'production']) for (const enabled of ['true', 'false']) {
  test(`shell-quoted boolean survives real detached helper into ${runtime} toolbox: ${enabled}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'signon-transport-'));
    try {
      // Local SSH/SCP adapters execute only the fixed detached script on this
      // machine. No network, host mutation or deployment command is reachable.
      writeFileSync(join(root, 'ssh'), '#!/bin/bash\nshift 5\nbash -c "$*"\n', { mode: 0o755 });
      writeFileSync(join(root, 'scp'), '#!/bin/bash\na=("$@")\nsrc="${a[${#a[@]}-2]}"\ncp "${src#*:}" "${a[${#a[@]}-1]}"\n', { mode: 0o755 });
      const assignment = readFileSync(new URL('../../.github/workflows/preview-environments.yml', import.meta.url), 'utf8')
        .split('\n').find(line => line.includes('"PREVIEW_UNIFIED_SIGN_ON=$(shell_quote'))!;
      const command = execFileSync('bash', ['-c', `shell_quote() { printf '%q' "$1"; }
remote_env=(
${assignment}
)
printf '%s' "\u0024{remote_env[*]} node scripts/preview/render-compose.mjs"`], { env: { ...process.env, PREVIEW_UNIFIED_SIGN_ON: enabled }, encoding: 'utf8' });
      const log = join(root, 'local.log');
      const result = spawnSync('bash', [new URL('./run-host-deploy-detached.sh', import.meta.url).pathname], { encoding: 'utf8', timeout: 15000, env: {
        ...process.env, PATH: `${root}:${process.env.PATH}`, SSH_IDENTITY: 'fixture-key', SSH_TARGET: 'local-only',
        LOCK_FILE: join(root, 'pr.lock'), DEPLOY_LOG: join(root, 'remote.log'), LOCAL_LOG_COPY: log,
        DEPLOY_POLL_SECONDS: '0.05', DEPLOY_TIMEOUT_SECONDS: '10', REMOTE_COMMAND: command,
        PR_NUMBER: '565', PREVIEW_SLUG: '', PREVIEW_DOMAIN: 'fixture.test', PREVIEW_RUNTIME: runtime,
        PREVIEW_AI_MODE: 'disabled', PREVIEW_UA_STUDENT_BILLING_ENABLED: 'false', DEMO_INTERNAL_API_KEYS: '',
        PREVIEW_DB_PASSWORD: 'fixture-password-0000000000000001',
        PREVIEW_ACCESS_SEATS: '[{"code":"fixture-otter-4193","organizationId":"local-dev-org","label":"Fixture"}]',
        PREVIEW_ACCESS_SECRET: 'fixture-access-secret-00000000001', PREVIEW_SESSION_SECRET: 'fixture-session-secret-000000001',
      } });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      const parsed = Bun.YAML.parse(readFileSync(log, 'utf8')) as any;
      expect(parsed.services.toolbox.environment.PREVIEW_UNIFIED_SIGN_ON).toBe(enabled);
      expect(parsed.services.web.environment.PREVIEW_UNIFIED_SIGN_ON).toBeUndefined();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
