import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const originalEmail = { ...await import('~/utils/email.server') };
const provider = mock(async () => ({ status: 'success' as const }));
mock.module('~/utils/email.server', () => ({ sendEmail: provider }));
const { deliverCode } = await import('./mail.server');
const { action, loader } = await import('~/routes/api.preview.qa.signon-code/route');
const { previewCodeCaptureEnabled } = await import('./preview-code.server');
const originalEnv = { ...process.env };
const secret = 'unit-test-preview-access-secret-32-characters';
const isolated = 'postgresql://app:placeholder@preview-postgres:5432/yawp_pr_565';
let recipient = '';
let temp: string | undefined;
beforeEach(() => {
  process.env.YAWP_ENVIRONMENT = 'preview';
  process.env.DATABASE_URL = isolated;
  process.env.PREVIEW_ACCESS_SECRET = secret;
  process.env.NODE_ENV = 'development';
  process.env.EMAIL_PROVIDER = 'ses';
  delete process.env.PREVIEW_SLUG;
  delete process.env.SIGNON_MAIL_CAPTURE_DIR;
  recipient = `capture-${crypto.randomUUID()}@example.invalid`;
  provider.mockClear();
});
afterEach(async () => {
  mock.restore();
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  if (temp) await rm(temp, { recursive: true, force: true });
  temp = undefined;
});
afterAll(() => mock.module('~/utils/email.server', () => originalEmail));

function retrieve(email = recipient, credential: string | null = secret, options: RequestInit = {}) {
  return action({ request: new Request('https://preview.example/api/preview/qa/signon-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(credential === null ? {} : { authorization: `Bearer ${credential}` }) },
    body: JSON.stringify({ email }),
    ...options,
  }) } as any);
}

test('captures the actual code privately before development guard/provider; recipient-specific, consume-on-read, no-store', async () => {
  const log = spyOn(console, 'info').mockImplementation(() => {});
  const code = '126890';
  await deliverCode(recipient, code);
  expect(provider).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  expect((await retrieve('other@example.invalid')).status).toBe(404);
  const response = await retrieve(` ${recipient.toUpperCase()} `);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect((await response.json()).code === code).toBe(true);
  expect((await retrieve()).status).toBe(404);
});

for (const credential of [null, '', 'incorrect']) {
  test(`rejects ${credential === null ? 'absent' : credential === '' ? 'empty' : 'wrong'} credentials without consuming capture`, async () => {
    await deliverCode(recipient, '126890');
    expect((await retrieve(recipient, credential)).status).toBe(401);
    expect((await retrieve()).status).toBe(200);
  });
}
test('missing server secret fails closed for capture and retrieval; no provider fallback', async () => {
  delete process.env.PREVIEW_ACCESS_SECRET;
  await expect(deliverCode(recipient, '126890')).rejects.toMatchObject({ status: 503 });
  expect((await retrieve()).status).toBe(404);
  expect(provider).not.toHaveBeenCalled();
});
test('blank or invalidly short server secrets cannot enable private capture', async () => {
  for (const value of ['', '   ', 'short']) {
    process.env.PREVIEW_ACCESS_SECRET = value;
    expect(previewCodeCaptureEnabled()).toBe(false);
    expect((await retrieve()).status).toBe(404);
  }
});

for (const environment of ['demo', 'production', '', undefined]) {
  test(`retrieval is hidden and never captures on environment ${environment ?? 'missing'} even with a preview DB and secret`, async () => {
    await deliverCode(recipient, '126890');
    if (environment === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = environment;
    expect(previewCodeCaptureEnabled()).toBe(false);
    const response = await retrieve();
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    // Existing development rejection is retained outside an eligible preview.
    await expect(deliverCode(recipient, '126890')).rejects.toMatchObject({ status: 503 });
    expect(provider).not.toHaveBeenCalled();
  });
}
for (const database of [undefined, '', 'malformed/yawp_pr_565', 'https://remote/yawp_pr_565',
  'postgresql://remote/yawp_demo', 'postgresql://remote/yawp_production',
  'postgresql://remote/not_preview?db=/yawp_pr_565', 'postgresql://remote/yawp_pr_565/extra',
  'postgresql://remote/yawp_pr_565#fragment', 'postgresql:///yawp_pr_565',
  ...['localhost', 'localhost.', 'a.localhost', '127.0.0.1', '127.1.2.3', '0.0.0.0', '[::1]', '2130706433', '0x7f000001', '%6cocalhost'].map(host => `postgresql://${host}/yawp_pr_565`)]) {
  test(`preview fails closed for ${database ?? 'missing database'}`, async () => {
    if (database === undefined) Reflect.deleteProperty(process.env, 'DATABASE_URL');
    else process.env.DATABASE_URL = database;
    expect(previewCodeCaptureEnabled()).toBe(false);
    for (const runtime of ['development', 'production'] as const) {
      process.env.NODE_ENV = runtime;
      await expect(deliverCode(recipient, '126890')).rejects.toMatchObject({ status: 503 });
      expect((await retrieve()).status).toBe(404);
    }
    expect(provider).not.toHaveBeenCalled();
  });
}
test('supports production runtime on isolated preview, never calls configured provider', async () => {
  process.env.NODE_ENV = 'production';
  await deliverCode(recipient, '126890');
  expect((await retrieve()).status).toBe(200);
  expect(provider).not.toHaveBeenCalled();
});
test('capture is scoped to deployment/database and expires after ten minutes', async () => {
  await deliverCode(recipient, '126890');
  process.env.DATABASE_URL = isolated.replace('565', '566');
  expect((await retrieve()).status).toBe(404);
  process.env.DATABASE_URL = isolated;
  const now = Date.now();
  spyOn(Date, 'now').mockReturnValue(now + 600001);
  expect((await retrieve()).status).toBe(404);
});
test('latest challenge replaces the previous capture for the same recipient', async () => {
  await deliverCode(recipient, '126890');
  await deliverCode(recipient, '986543');
  expect((await (await retrieve()).json()).code === '986543').toBe(true);
});
test('capture storage is bounded and evicts the oldest entry', async () => {
  await deliverCode(recipient, '126890');
  for (let i = 0; i < 500; i++) await deliverCode(`bounded-${i}@example.invalid`, '126890');
  expect((await retrieve()).status).toBe(404);
  expect((await retrieve('bounded-499@example.invalid')).status).toBe(200);
});
test('session cookies and human preview seat codes cannot retrieve captures', async () => {
  await deliverCode(recipient, '126890');
  process.env.PREVIEW_MASTER_ACCESS_CODE = 'fixture-human-code';
  expect((await retrieve(recipient, 'fixture-human-code')).status).toBe(401);
  expect((await retrieve(recipient, process.env.SESSION_SECRET!)).status).toBe(401);
  expect((await retrieve(recipient, null, { headers: { cookie: '__yawp_preview_access=placeholder' } })).status).toBe(401);
});
test('GET never retrieves; rejects query credentials, invalid JSON, extra fields and oversized bodies', async () => {
  await deliverCode(recipient, '126890');
  expect((await loader()).status).toBe(404);
  for (const body of ['{', '{}', JSON.stringify({ email: recipient, secret }), 'x'.repeat(2049)]) {
    expect((await retrieve(recipient, secret, { body })).status).toBe(400);
  }
  const request = new Request(`https://preview.example/api/preview/qa/signon-code?credential=placeholder`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: recipient }),
  });
  expect((await action({ request } as any)).status).toBe(401);
  expect((await retrieve()).status).toBe(200);
});
test('demo and production keep normal delivery when running in production', async () => {
  for (const environment of ['demo', 'production']) {
    process.env.YAWP_ENVIRONMENT = environment;
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = `postgresql://remote/yawp_${environment}`;
    await deliverCode(recipient, '126890');
  }
  expect(provider).toHaveBeenCalledTimes(2);
});
test('shared-renderer demo preserves delivery and never enables capture, even with preview metadata', async () => {
  process.env.PREVIEW_SLUG = 'demo';
  expect(previewCodeCaptureEnabled()).toBe(false); // Also rejects accidental preview-looking DB on demo.
  expect((await retrieve()).status).toBe(404);
  process.env.DATABASE_URL = 'postgresql://remote/yawp_demo';
  process.env.NODE_ENV = 'production';
  await deliverCode(recipient, '126890');
  expect(provider).toHaveBeenCalledTimes(1);
  expect((await retrieve()).status).toBe(404);
});
test('local file capture retains private permissions and does not call a provider', async () => {
  delete process.env.YAWP_ENVIRONMENT;
  process.env.DATABASE_URL = 'postgresql://localhost/yawp_local';
  temp = await mkdtemp(path.join(process.env.TMPDIR!, 'otp-local-'));
  const capture = path.join(temp, 'mail');
  process.env.SIGNON_MAIL_CAPTURE_DIR = capture;
  await deliverCode(recipient, '126890');
  const files = await readdir(capture);
  expect(files).toHaveLength(1);
  const file = path.join(capture, files[0]);
  expect(JSON.parse(await readFile(file, 'utf8')).code === '126890').toBe(true);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(provider).not.toHaveBeenCalled();
});
