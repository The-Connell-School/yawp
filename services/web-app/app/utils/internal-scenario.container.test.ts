import { test, expect } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const docker = async (args: string[], input?: string) => {
  const child = Bun.spawn(['docker', ...args], { stdin: input ? new Blob([input]) : 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw new Error(`Docker command failed: ${stderr.slice(-3000)}`);
  return stdout;
};
test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('packaged scenario runner reaches only the selected preview network and applies real data', async () => {
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
  const url = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) throw new Error('Owned local DB required');
  const container = process.env.INTERNAL_SCENARIO_TEST_CONTAINER!;
  if (!/^yawp-[a-z0-9-]+-postgres$/.test(container)) throw new Error('Owned scenario capsule database container required');
  expect((await docker(['port', container, '5432/tcp'])).trim()).toContain(`:${url.port}`);
  const root = new URL('../../../../', import.meta.url).pathname;
  const image = 'yawp-internal-scenario-runner:local';
  await docker(['build', '-t', image, '-f', join(root, 'infra/Dockerfile.scenario'), root]);
  process.env.DATABASE_URL = connection; process.env.E2E_DATABASE_URL = connection;
  const { basePrisma: db } = await import('./db.server');
  const org = await db.organization.create({ data: { name: 'Docker scenario runner QA' } });
  const targetId = randomUUID(), network = `yawp-scenario-test-${randomUUID()}`;
  const directory = await mkdtemp(join(tmpdir(), 'yawp-scenario-container-'));
  let connected = false;
  try {
    await docker(['network', 'create', '--internal', network]);
    await docker(['network', 'connect', '--alias', 'yawp-internal-preview-postgres', network, container]);
    connected = true;
    url.hostname = 'yawp-internal-preview-postgres'; url.port = '5432';
    const configPath = join(directory, 'targets.json');
    await writeFile(configPath, JSON.stringify({ targets: [{ targetId, environment: 'preview', organizationId: org.id, databaseUrl: url.toString(), revision: 'a'.repeat(40) }] }), { mode: 0o600 });
    const request = { jobId: randomUUID(), actorId: 'container-test-operator', fingerprint: 'c'.repeat(64), mode: 'populate',
      target: { id: targetId, environment: 'preview', revision: 'a'.repeat(40) },
      recipe: { teachers: 1, students: 2, classes: 1, assignmentsPerClass: 1, submissions: 'submitted' } };
    const args = ['run', '--rm', '-i', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=512m',
      '--user', `${process.getuid!()}:${process.getgid!()}`, '--network', network, '--mount', `type=bind,src=${directory},dst=/etc/yawp-internal,readonly`,
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '-e', 'SCENARIO_CONFIG=/etc/yawp-internal/targets.json', image];
    const first = await docker(args, JSON.stringify(request));
    expect(JSON.parse(first)).toMatchObject({ jobId: request.jobId, targetId, counts: { users: 3, classes: 1, assignments: 1, submissions: 2 } });
    expect(await docker(args, JSON.stringify(request))).toBe(first);
    expect(await db.orgMembership.count({ where: { organizationId: org.id, isActive: true } })).toBe(3);
    const env = await docker(['image', 'inspect', '--format', '{{json .Config.Env}}', image]);
    expect(env).not.toContain('DATABASE_URL');
    const files = await docker(['run', '--rm', '--network=none', '--entrypoint=sh', image, '-c', 'test ! -e /app/.env && test ! -e /app/services/web-app/.env && test ! -e /app/.git && echo clean']);
    expect(files.trim()).toBe('clean');
  } finally {
    if (connected) await docker(['network', 'disconnect', network, container]);
    await docker(['network', 'rm', network]).catch(() => {});
    await rm(directory, { recursive: true, force: true });
    await db.$disconnect();
  }
}, 900000);
