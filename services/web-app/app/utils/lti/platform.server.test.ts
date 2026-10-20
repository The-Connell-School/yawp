import { describe, expect, test } from 'bun:test';
import {
  getConfiguredLtiPlatforms,
  isBlackboardLtiMockVerificationEnabled,
  isYawpProductionEnvironment,
} from './platform.server';

const appRunnerProduction = {
  NODE_ENV: 'production',
  BLACKBOARD_LTI_MOCK_URL: 'http://127.0.0.1:9473',
} as unknown as NodeJS.ProcessEnv;

describe('LTI platform helpers', () => {
  test('treats App Runner as production when NODE_ENV=production and YAWP_ENVIRONMENT is unset', () => {
    expect(isYawpProductionEnvironment(appRunnerProduction)).toBe(true);
    expect(isBlackboardLtiMockVerificationEnabled(appRunnerProduction)).toBe(false);
    expect(getConfiguredLtiPlatforms(appRunnerProduction)).toEqual([]);
  });

  test('YAWP_ENVIRONMENT=production disables mock verification even when mock URL is set', () => {
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

  test('preview and demo under NODE_ENV=production are not treated as production', () => {
    expect(
      isYawpProductionEnvironment({
        NODE_ENV: 'production',
        YAWP_ENVIRONMENT: 'preview',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
    expect(
      isBlackboardLtiMockVerificationEnabled({
        NODE_ENV: 'production',
        YAWP_ENVIRONMENT: 'preview',
        BLACKBOARD_LTI_MOCK_URL: 'http://127.0.0.1:9473',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(true);
    expect(
      isYawpProductionEnvironment({
        NODE_ENV: 'production',
        YAWP_ENVIRONMENT: 'demo',
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
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

  test('lists only the Blackboard mock when mock URL is configured for preview', () => {
    const platforms = getConfiguredLtiPlatforms({
      NODE_ENV: 'production',
      YAWP_ENVIRONMENT: 'preview',
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
