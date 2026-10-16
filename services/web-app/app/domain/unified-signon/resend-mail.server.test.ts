import { afterEach, expect, test } from 'bun:test';
import { assertResendMailAvailable } from './resend-mail.server';
const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env))
    if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});
function preview() {
  process.env.YAWP_ENVIRONMENT = 'preview';
  process.env.DATABASE_URL =
    'postgresql://yawp_pr_565_app:fixture-password@preview-postgres:5432/yawp_pr_565';
  process.env.NODE_ENV = 'development';
  process.env.PREVIEW_SLUG = 'pr-565';
  process.env.PREVIEW_DATA_MODE = 'seed';
  delete process.env.DATABASE_SCHEMA;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.SIGNON_MAIL_CAPTURE_DIR;
}
test('isolated provider-free preview resends reach capture without a local capture directory', () => {
  preview();
  expect(() => assertResendMailAvailable()).not.toThrow();
  process.env.NODE_ENV = 'production';
  expect(() => assertResendMailAvailable()).not.toThrow();
});
for (const database of [
  undefined,
  '',
  'invalid/yawp_pr_565',
  'https://remote/yawp_pr_565',
  'postgresql://remote/yawp_demo',
  'postgresql://remote/yawp_pr_565/extra',
  'postgresql://remote/other?db=/yawp_pr_565',
  'postgresql://remote/yawp_pr_565#fragment',
  'postgresql:///yawp_pr_565',
  ...[
    'localhost',
    'localhost.',
    'a.localhost',
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '[::1]',
    '2130706433',
    '0x7f000001',
    '%6cocalhost',
  ].map((host) => `postgresql://${host}/yawp_pr_565`),
  ...[
    'host=remote',
    '%68ost=127.0.0.1',
    'hostaddr=127.0.0.1',
    'port=5433',
    'host=a&host=b',
    'connectionString=postgresql%3A%2F%2Flocalhost%2Fyawp_pr_565',
  ].map((query) => `postgresql://remote/yawp_pr_565?${query}`),
]) {
  test(`preview resend rejects unsupported database ${database ?? 'missing'} in either runtime without local-capture bypass`, () => {
    preview();
    if (database === undefined)
      Reflect.deleteProperty(process.env, 'DATABASE_URL');
    else process.env.DATABASE_URL = database;
    for (const runtime of ['development', 'production'] as const) {
      process.env.NODE_ENV = runtime;
      process.env.SIGNON_MAIL_CAPTURE_DIR = `${process.env.TMPDIR}/must-not-bypass`;
      expect(() => assertResendMailAvailable()).toThrow(
        'Email delivery is unavailable.'
      );
    }
  });
}
for (const provider of ['ses', 'aws-ses', 'SES', 'unsupported'])
  test(`preview cannot fall through to ${provider}`, () => {
    preview();
    process.env.EMAIL_PROVIDER = provider;
    expect(() => assertResendMailAvailable()).toThrow();
  });
test('real Resend credentials cannot enable preview resend', () => {
  preview();
  process.env.RESEND_API_KEY = 'not-a-real-key';
  expect(() => assertResendMailAvailable()).toThrow();
  process.env.RESEND_API_KEY = 'preview-resend-key';
  expect(() => assertResendMailAvailable()).not.toThrow();
});
for (const environment of ['demo', 'production', undefined])
  test(`${environment ?? 'missing'} environment retains the existing development guard and production delivery`, () => {
    preview();
    if (environment === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = environment;
    expect(() => assertResendMailAvailable()).toThrow();
    process.env.NODE_ENV = 'production';
    expect(() => assertResendMailAvailable()).not.toThrow();
  });
test('shared renderer demo slug retains the existing guard', () => {
  preview();
  process.env.PREVIEW_SLUG = 'demo';
  expect(() => assertResendMailAvailable()).toThrow();
  process.env.NODE_ENV = 'production';
  expect(() => assertResendMailAvailable()).not.toThrow();
});
test('existing non-preview local capture remains available', () => {
  preview();
  process.env.YAWP_ENVIRONMENT = 'development';
  process.env.SIGNON_MAIL_CAPTURE_DIR = `${process.env.TMPDIR}/local`;
  expect(() => assertResendMailAvailable()).not.toThrow();
});

for (const [key, value] of [
  ['YAWP_ENVIRONMENT', 'PREVIEW'],
  ['YAWP_ENVIRONMENT', ' preview '],
  ['PREVIEW_DATA_MODE', undefined],
  ['PREVIEW_DATA_MODE', 'production-dump'],
  ['PREVIEW_SLUG', undefined],
  ['PREVIEW_SLUG', 'pr-566'],
  ['DATABASE_SCHEMA', 'public'],
  [
    'DATABASE_URL',
    'postgresql://postgres:fixture-password@preview-postgres:5432/yawp_pr_565',
  ],
  [
    'DATABASE_URL',
    'postgresql://yawp_pr_566_app:fixture-password@preview-postgres:5432/yawp_pr_565',
  ],
  [
    'DATABASE_URL',
    'postgresql://yawp_pr_565_app:fixture-password@other-host:5432/yawp_pr_565',
  ],
  [
    'DATABASE_URL',
    'postgresql://yawp_pr_565_app:fixture-password@preview-postgres:5433/yawp_pr_565',
  ],
  [
    'DATABASE_URL',
    'postgresql://yawp_pr_565_app:fixture-password@preview-postgres:5432/yawp_pr_565?schema=public',
  ],
] as const)
  test(`unsupported deployed isolation configuration ${key}=${value ?? 'missing'} fails closed`, () => {
    preview();
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Reflect.set(process.env, key, value);
    process.env.NODE_ENV = 'production';
    expect(() => assertResendMailAvailable()).toThrow();
  });
