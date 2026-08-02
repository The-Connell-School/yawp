/**
 * Worker configuration.
 *
 * The renderer refuses to start without an explicit statement that its target
 * holds demo data. The web app makes the same demand independently: a worker
 * pointed at the wrong environment films real student work, and neither side
 * should be able to cause that alone.
 */

export type RendererConfig = {
  databaseUrl: string;
  targetUrl: string;
  bucket: string;
  region: string;
  /** 's3' uploads to the videos bucket; 'disk' copies onto a volume the web app serves. */
  storage: 's3' | 'disk';
  mediaDir: string | null;
  /**
   * The pg `ssl` option, or undefined for plain TCP. Undefined matters: any
   * ssl object at all makes pg attempt a TLS handshake, which a plain
   * Dockerized Postgres (every preview environment) refuses outright. Mirrors
   * the web app's db.server.ts decision so the two connect identically.
   */
  databaseSsl: { rejectUnauthorized: false } | undefined;
  workerId: string;
  pollIntervalMs: number;
  chromiumPath?: string;
  ffmpegPath: string;
  loginPath: string;
  /** Credential for a render target behind a basic-auth gate, e.g. a preview environment. */
  basicAuth?: { username: string; password: string };
};

export class ConfigError extends Error {}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ConfigError(`${key} is required`);
  return value;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env
): RendererConfig {
  if (env.MARKETING_RENDER_TARGET_IS_DEMO !== 'confirmed') {
    throw new ConfigError(
      'MARKETING_RENDER_TARGET_IS_DEMO must be "confirmed". The renderer only films environments an operator has stated hold demo data.'
    );
  }

  const rawTarget = requireEnv(env, 'MARKETING_RENDER_TARGET_URL');
  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new ConfigError(
      `MARKETING_RENDER_TARGET_URL is not a url: ${rawTarget}`
    );
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new ConfigError('MARKETING_RENDER_TARGET_URL must be http or https');
  }

  // Preview environments sit behind a shared basic-auth gate; the renderer needs
  // that credential to reach them. "user:password", same shape the preview
  // healthcheck uses. Malformed is an error rather than a silent no-credential,
  // because the failure it would cause — every request 401ing — looks like a
  // broken target, not a broken credential.
  let basicAuth: RendererConfig['basicAuth'];
  const rawBasicAuth = env.MARKETING_RENDERER_BASIC_AUTH?.trim();
  if (rawBasicAuth) {
    const separator = rawBasicAuth.indexOf(':');
    if (separator <= 0 || separator === rawBasicAuth.length - 1) {
      throw new ConfigError(
        'MARKETING_RENDERER_BASIC_AUTH must look like "user:password"'
      );
    }
    basicAuth = {
      username: rawBasicAuth.slice(0, separator),
      password: rawBasicAuth.slice(separator + 1),
    };
  }

  const storage =
    env.MARKETING_MEDIA_STORAGE?.trim() === 'disk' ? 'disk' : 's3';
  const mediaDir = env.MARKETING_MEDIA_DIR?.trim() || null;
  if (storage === 'disk' && !mediaDir) {
    throw new ConfigError(
      'MARKETING_MEDIA_DIR is required when MARKETING_MEDIA_STORAGE=disk'
    );
  }

  const databaseUrl = requireEnv(env, 'DATABASE_URL');
  const requiresTls =
    env.DATABASE_SSL_REQUIRE === 'true' ||
    /\.rds\.amazonaws\.com/i.test(databaseUrl) ||
    /[?&]sslmode=require(?:&|$)/i.test(databaseUrl) ||
    /[?&]sslmode=verify-ca(?:&|$)/i.test(databaseUrl) ||
    /[?&]sslmode=verify-full(?:&|$)/i.test(databaseUrl);

  return {
    databaseUrl,
    databaseSsl: requiresTls ? { rejectUnauthorized: false } : undefined,
    targetUrl: target.origin,
    // Disk mode has no bucket to demand; s3 mode fails without one.
    bucket: storage === 's3' ? requireEnv(env, 'AWS_S3_BUCKET_FOR_VIDEOS') : '',
    region: env.AWS_S3_REGION_FOR_VIDEOS?.trim() || 'us-east-1',
    storage,
    mediaDir,
    workerId:
      env.MARKETING_RENDERER_WORKER_ID?.trim() ||
      `${env.HOSTNAME || 'renderer'}-${process.pid}`,
    pollIntervalMs: Number(env.MARKETING_RENDERER_POLL_MS || 5000),
    chromiumPath: env.MARKETING_RENDERER_CHROMIUM_PATH?.trim() || undefined,
    ffmpegPath: env.FFMPEG_PATH?.trim() || 'ffmpeg',
    loginPath: env.MARKETING_RENDERER_LOGIN_PATH?.trim() || '/auth/dev-login',
    basicAuth,
  };
}
