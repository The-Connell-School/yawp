import { isLocalDevAuthEnabled } from './local-dev-auth.server';

export function isBlackboardLtiMockUiEnabled(
  env: NodeJS.ProcessEnv = process.env
) {
  const mockUrl = String(env.BLACKBOARD_LTI_MOCK_URL || '').trim();
  if (!mockUrl) return false;
  if (String(env.YAWP_ENVIRONMENT || '').toLowerCase() === 'production') {
    return false;
  }
  if (
    env.NODE_ENV === 'production' &&
    String(env.YAWP_ENVIRONMENT || '').toLowerCase() !== 'preview'
  ) {
    return false;
  }
  return isLocalDevAuthEnabled();
}

export function blackboardLtiMockUpstreamUrl(
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isBlackboardLtiMockUiEnabled(env)) return null;
  return String(env.BLACKBOARD_LTI_MOCK_URL).replace(/\/$/, '');
}
