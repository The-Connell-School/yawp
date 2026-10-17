import { expect, test } from 'bun:test';
import { assertPreviewSignonTarget } from '../../packages/prisma/scripts/seed-preview-signon-qa';
import { spawnSync } from 'node:child_process';
import { renderPreviewCompose } from './render-compose.mjs';
import { readFileSync } from 'node:fs';
const read = (p: string) =>
  readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
test('sign-on fixtures run in fresh and unchanged-tooling preview seed paths only', () => {
  const deploy = read('scripts/preview/deploy.sh');
  expect(deploy.match(/should_run_signon_qa_seed/g)?.length).toBe(3);
  expect(deploy).toContain(
    '[[ "$SLUG" =~ ^pr-[0-9]+$ && "$DATA_MODE" == "seed" ]]'
  );
  expect(deploy).toContain(
    'bun prisma generate && cd packages/prisma && bun run seed-preview-signon-qa'
  );
  expect(deploy).toContain(
    "tooling_command+=' && bun run seed-preview-signon-qa'"
  );
  for (const p of [
    'packages/prisma/scripts/seed-local-dev.ts',
    'packages/prisma/scripts/seed.ts',
    'scripts/worktree-local-setup.sh',
  ]) {
    expect(read(p)).not.toContain('seed-preview-signon-qa');
  }
  expect(
    JSON.parse(read('packages/prisma/package.json')).scripts[
      'seed-preview-signon-qa'
    ]
  ).toBe('bun run scripts/seed-preview-signon-qa.ts');
});

test('rendered fast and production runtime toolbox environments pass only for PR seed mode', () => {
  const deploy = read('scripts/preview/deploy.sh');
  const guard = deploy.match(
    /should_run_signon_qa_seed\(\) \{[\s\S]*?\n\}/
  )![0];
  const options = {
    domain: 'example.test',
    sourceDir: process.cwd(),
    accessSeats: JSON.stringify([
      {
        code: 'fixture-otter-4193',
        organizationId: 'fixture-org',
        label: 'Master',
      },
    ]),
    sessionSecret: 'fixture-session-secret-32-characters',
    accessSecret: 'fixture-access-secret-32-characters',
    databasePassword: 'fixture-database-password-00010001',
  };
  for (const runtime of ['fast', 'production'])
    for (const slug of ['pr-565', 'demo'])
      for (const dataMode of ['seed', 'sanitized-production']) {
        const config = Bun.YAML.parse(
          renderPreviewCompose({
            ...options,
            runtime,
            dataMode,
            ...(slug === 'demo' ? { slug } : { prNumber: '565' }),
          })
        ) as any;
        const env = config.services.toolbox.environment;
        const allowed = slug === 'pr-565' && dataMode === 'seed';
        const shell = spawnSync(
          'bash',
          ['-c', guard + '\nshould_run_signon_qa_seed'],
          { env: { ...process.env, SLUG: slug, DATA_MODE: dataMode } }
        );
        expect(shell.status === 0).toBe(allowed);
        if (allowed) expect(() => assertPreviewSignonTarget(env)).not.toThrow();
        else
          expect(() => assertPreviewSignonTarget(env)).toThrow(
            'isolated PR preview'
          );
      }
});
