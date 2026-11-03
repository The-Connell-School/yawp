import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { renderPreviewCompose } from './render-compose.mjs';

const workflow = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/demo-environment.yml', import.meta.url), 'utf8')) as any;

test('demo validates its mail credential even when billing is disabled', () => {
  const check = workflow.jobs['demo-deploy'].steps.find((step: any) => step.name === 'Check demo configuration');
  const result = spawnSync('bash', ['-c', check.run], {
    encoding: 'utf8', env: {
      PATH: process.env.PATH!, PREVIEW_HOST: 'fixture', DEMO_SSH_PRIVATE_KEY: 'fixture',
      PREVIEW_ANTHROPIC_API_KEY: 'fixture', PREVIEW_POSTGRES_ADMIN_PASSWORD: 'fixture',
      PREVIEW_MASTER_ACCESS_CODE: 'fixture', PREVIEW_UA_STUDENT_BILLING_ENABLED: 'false',
      PREVIEW_RESEND_API_KEY: '', DEMO_BACKUP_RETENTION: '14',
      DEMO_BACKUP_S3_URI: 's3://fixture/demo', DEMO_RESET_DATA: 'false',
    },
  });
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain('Missing demo secret DEMO_RESEND_API_KEY');
});

test('demo explicitly selects Resend and carries its existing scoped credential to the web container', () => {
  const saved = process.env.PREVIEW_RESEND_API_KEY;
  process.env.PREVIEW_RESEND_API_KEY = 're_fixture_only';
  try {
    const compose = Bun.YAML.parse(renderPreviewCompose({
      slug: 'demo', runtime: 'production', domain: 'example.test', sourceDir: '/tmp/fixture',
      accessSeats: JSON.stringify([{ code: 'fixture-otter-4193', organizationId: 'local-dev-org', label: 'Master' }]),
      sessionSecret: 'fixture-session-secret-32-characters', accessSecret: 'fixture-access-secret-32-characters',
      databasePassword: 'fixture-database-password-00010001',
    })) as any;
    expect(compose.services.web.environment.EMAIL_PROVIDER).toBe('resend');
    expect(compose.services.web.environment.RESEND_API_KEY).toBe('re_fixture_only');
    expect(compose.services.web.environment.SES_FROM_EMAIL).toBeUndefined();
    expect(compose.services.web.environment.SIGNON_MAIL_CAPTURE_DIR).toBeUndefined();
  } finally {
    if (saved === undefined) delete process.env.PREVIEW_RESEND_API_KEY;
    else process.env.PREVIEW_RESEND_API_KEY = saved;
  }
});
