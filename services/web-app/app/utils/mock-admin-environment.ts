export function mockAdminEnvironment(env: {
  PREVIEW_SLUG?: string;
  YAWP_ENVIRONMENT?: string;
  NODE_ENV?: string;
}) {
  return env.PREVIEW_SLUG === 'demo'
    ? 'demo'
    : env.YAWP_ENVIRONMENT ||
        (env.NODE_ENV === 'production' ? 'production' : 'development');
}
