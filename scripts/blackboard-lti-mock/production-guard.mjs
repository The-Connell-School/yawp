const PRODUCTION_YAWP_ENVIRONMENTS = new Set(['production']);
const PREVIEW_YAWP_ENVIRONMENTS = new Set(['preview']);

export function assertBlackboardLtiMockAllowed(env = process.env) {
  const yawpEnvironment = String(env.YAWP_ENVIRONMENT || '')
    .trim()
    .toLowerCase();
  const nodeEnv = String(env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  const enabled = String(env.BLACKBOARD_LTI_MOCK_ENABLED || '')
    .trim()
    .toLowerCase();

  if (PRODUCTION_YAWP_ENVIRONMENTS.has(yawpEnvironment)) {
    throw new Error(
      'Blackboard LTI mock refuses to start when YAWP_ENVIRONMENT=production'
    );
  }

  if (nodeEnv === 'production' && !PREVIEW_YAWP_ENVIRONMENTS.has(yawpEnvironment)) {
    throw new Error(
      'Blackboard LTI mock refuses to start when NODE_ENV=production unless YAWP_ENVIRONMENT=preview'
    );
  }

  if (enabled !== 'true' && enabled !== '1') {
    throw new Error(
      'Blackboard LTI mock refuses to start unless BLACKBOARD_LTI_MOCK_ENABLED=true'
    );
  }
}
