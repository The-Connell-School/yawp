import { describe, expect, test } from 'bun:test';
import {
  getConfiguredLtiPlatforms,
  isBlackboardLtiMockVerificationEnabled,
  isYawpProductionEnvironment,
} from './platform.server';

describe('LTI platform helpers', () => {
  test('production disables mock verification even when mock URL is set', () => {
    expect(
      isBlackboardLtiMockVerificationEnabled({
        YAWP_ENVIRONMENT: 'production',
        BLACKBOARD_LTI_MOCK_URL: 'http://127.0.0.1:9473',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
    expect(
      isYawpProductionEnvironment({ YAWP_ENVIRONMENT: 'production' } as unknown as NodeJS.ProcessEnv)
    ).toBe(true);
  });

  test('mock verification requires an explicit mock URL outside production', () => {
    expect(
      isBlackboardLtiMockVerificationEnabled({
        YAWP_ENVIRONMENT: 'preview',
        BLACKBOARD_LTI_MOCK_URL: 'http://127.0.0.1:9473',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(true);
    expect(
      isBlackboardLtiMockVerificationEnabled({
        YAWP_ENVIRONMENT: 'preview',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  test('lists only the Blackboard mock when mock URL is configured', () => {
    const platforms = getConfiguredLtiPlatforms({
      BLACKBOARD_LTI_MOCK_URL: 'http://127.0.0.1:9473',
      LTI_CLIENT_ID: 'yawp-blackboard-mock',
    } as unknown as NodeJS.ProcessEnv);
    expect(platforms).toEqual([
      {
        id: 'blackboard-lti-mock',
        issuer: 'https://blackboard.com',
        clientId: 'yawp-blackboard-mock',
        jwksUrl:
          'http://127.0.0.1:9473/api/v1/management/applications/yawp-blackboard-mock/jwks.json',
        source: 'blackboard-lti-mock',
      },
    ]);
  });

  test('reports no configured platforms when mock URL is absent', () => {
    expect(getConfiguredLtiPlatforms({} as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });
});
