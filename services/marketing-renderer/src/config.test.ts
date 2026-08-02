import { describe, expect, test } from 'bun:test';
import { ConfigError, loadConfig } from './config';

const BASE = {
  DATABASE_URL: 'postgresql://localhost:5432/demo',
  MARKETING_RENDER_TARGET_URL: 'https://demo.yawp.test',
  MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
  AWS_S3_BUCKET_FOR_VIDEOS: 'yawp-videos',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  test('refuses to start without an explicit demo confirmation', () => {
    expect(() =>
      loadConfig({ ...BASE, MARKETING_RENDER_TARGET_IS_DEMO: undefined })
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...BASE, MARKETING_RENDER_TARGET_IS_DEMO: 'true' })
    ).toThrow(ConfigError);
  });

  test('requires a database, a target, and a bucket', () => {
    expect(() => loadConfig({ ...BASE, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/
    );
    expect(() =>
      loadConfig({ ...BASE, MARKETING_RENDER_TARGET_URL: undefined })
    ).toThrow(/MARKETING_RENDER_TARGET_URL/);
    expect(() =>
      loadConfig({ ...BASE, AWS_S3_BUCKET_FOR_VIDEOS: undefined })
    ).toThrow(/AWS_S3_BUCKET_FOR_VIDEOS/);
  });

  test('rejects a target that is not an http url', () => {
    expect(() =>
      loadConfig({ ...BASE, MARKETING_RENDER_TARGET_URL: 'file:///etc/passwd' })
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...BASE, MARKETING_RENDER_TARGET_URL: 'demo.yawp.test' })
    ).toThrow(ConfigError);
  });

  test('parses a basic-auth credential for gated targets', () => {
    const config = loadConfig({
      ...BASE,
      MARKETING_RENDERER_BASIC_AUTH: 'preview-admin:s3cret:with:colons',
    });

    expect(config.basicAuth).toEqual({
      username: 'preview-admin',
      password: 's3cret:with:colons',
    });
  });

  test('omits the credential when none is configured', () => {
    expect(loadConfig({ ...BASE }).basicAuth).toBeUndefined();
  });

  test('rejects a credential that is not user:password', () => {
    for (const value of ['no-colon', ':leading', 'trailing:']) {
      expect(() =>
        loadConfig({ ...BASE, MARKETING_RENDERER_BASIC_AUTH: value })
      ).toThrow(ConfigError);
    }
  });

  test('disk storage requires a media dir and drops the bucket requirement', () => {
    expect(() =>
      loadConfig({
        ...BASE,
        AWS_S3_BUCKET_FOR_VIDEOS: undefined,
        MARKETING_MEDIA_STORAGE: 'disk',
      })
    ).toThrow(/MARKETING_MEDIA_DIR/);

    const config = loadConfig({
      ...BASE,
      AWS_S3_BUCKET_FOR_VIDEOS: undefined,
      MARKETING_MEDIA_STORAGE: 'disk',
      MARKETING_MEDIA_DIR: '/media',
    });
    expect(config.storage).toBe('disk');
    expect(config.mediaDir).toBe('/media');
  });

  test('defaults to s3 storage, which still demands a bucket', () => {
    expect(loadConfig({ ...BASE }).storage).toBe('s3');
    expect(() =>
      loadConfig({ ...BASE, AWS_S3_BUCKET_FOR_VIDEOS: undefined })
    ).toThrow(/AWS_S3_BUCKET_FOR_VIDEOS/);
  });

  // Any `ssl` option at all makes pg attempt a TLS handshake, and the preview's
  // plain Dockerized Postgres refuses it — the worker crash-looped on its first
  // queue poll while the web app, which gates ssl on the URL, connected fine.
  // The decision must mirror db.server.ts exactly: TLS only when the URL or an
  // explicit override demands it, and never merely because
  // DATABASE_SSL_REJECT_UNAUTHORIZED is present.
  test('plain database urls get no ssl option, even with the reject override set', () => {
    const config = loadConfig({
      ...BASE,
      DATABASE_URL: 'postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_240',
      DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
    });

    expect(config.databaseSsl).toBeUndefined();
  });

  test('rds hosts, sslmode=require, and DATABASE_SSL_REQUIRE all demand lax tls', () => {
    const rds = loadConfig({
      ...BASE,
      DATABASE_URL:
        'postgresql://user:pass@yawp.cluster-abc.us-east-1.rds.amazonaws.com:5432/yawp',
    });
    expect(rds.databaseSsl).toEqual({ rejectUnauthorized: false });

    const sslmode = loadConfig({
      ...BASE,
      DATABASE_URL: 'postgresql://localhost:5432/demo?sslmode=require',
    });
    expect(sslmode.databaseSsl).toEqual({ rejectUnauthorized: false });

    const forced = loadConfig({ ...BASE, DATABASE_SSL_REQUIRE: 'true' });
    expect(forced.databaseSsl).toEqual({ rejectUnauthorized: false });
  });

  test('normalizes the target to an origin and fills defaults', () => {
    const config = loadConfig({
      ...BASE,
      MARKETING_RENDER_TARGET_URL: 'https://demo.yawp.test/app/',
    });

    expect(config.targetUrl).toBe('https://demo.yawp.test');
    expect(config.region).toBe('us-east-1');
    expect(config.ffmpegPath).toBe('ffmpeg');
    expect(config.loginPath).toBe('/auth/dev-login');
    expect(config.pollIntervalMs).toBe(5000);
    expect(config.workerId).toContain('-');
  });
});
