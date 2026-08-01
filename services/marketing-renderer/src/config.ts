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
  workerId: string;
  pollIntervalMs: number;
  chromiumPath?: string;
  ffmpegPath: string;
  loginPath: string;
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

  return {
    databaseUrl: requireEnv(env, 'DATABASE_URL'),
    targetUrl: target.origin,
    bucket: requireEnv(env, 'AWS_S3_BUCKET_FOR_VIDEOS'),
    region: env.AWS_S3_REGION_FOR_VIDEOS?.trim() || 'us-east-1',
    workerId:
      env.MARKETING_RENDERER_WORKER_ID?.trim() ||
      `${env.HOSTNAME || 'renderer'}-${process.pid}`,
    pollIntervalMs: Number(env.MARKETING_RENDERER_POLL_MS || 5000),
    chromiumPath: env.MARKETING_RENDERER_CHROMIUM_PATH?.trim() || undefined,
    ffmpegPath: env.FFMPEG_PATH?.trim() || 'ffmpeg',
    loginPath: env.MARKETING_RENDERER_LOGIN_PATH?.trim() || '/auth/dev-login',
  };
}
