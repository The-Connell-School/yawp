export function shouldUseSecureCookies(
  env: Partial<Record<'COOKIE_SECURE' | 'NODE_ENV', string>> = process.env,
) {
  if (env.COOKIE_SECURE === 'true') return true;
  if (env.COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production';
}
