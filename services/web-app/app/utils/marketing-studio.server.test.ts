import { afterEach, describe, expect, test } from 'bun:test';
import {
  getMarketingRenderTarget,
  isMarketingStudioEnabled,
} from './marketing-studio.server';

const KEYS = [
  'MARKETING_STUDIO_ENABLED',
  'MARKETING_RENDER_TARGET_URL',
  'MARKETING_RENDER_TARGET_IS_DEMO',
] as const;

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

afterEach(() => setEnv({}));

describe('isMarketingStudioEnabled', () => {
  test('is off when nothing is configured', () => {
    setEnv({});

    expect(isMarketingStudioEnabled()).toBe(false);
  });

  test('is off when the flag is on but no render target is configured', () => {
    setEnv({ MARKETING_STUDIO_ENABLED: 'on' });

    expect(isMarketingStudioEnabled()).toBe(false);
  });

  test('is off when the target exists but nobody confirmed it is a demo environment', () => {
    setEnv({
      MARKETING_STUDIO_ENABLED: 'on',
      MARKETING_RENDER_TARGET_URL: 'https://demo.yawp.school',
    });

    expect(isMarketingStudioEnabled()).toBe(false);
    expect(getMarketingRenderTarget()).toBeNull();
  });

  test('is on only with the flag, a target, and an explicit demo confirmation', () => {
    setEnv({
      MARKETING_STUDIO_ENABLED: 'on',
      MARKETING_RENDER_TARGET_URL: 'https://demo.yawp.school',
      MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
    });

    expect(isMarketingStudioEnabled()).toBe(true);
    expect(getMarketingRenderTarget()).toBe('https://demo.yawp.school');
  });

  test('stays off for a flag value other than on', () => {
    setEnv({
      MARKETING_STUDIO_ENABLED: 'true',
      MARKETING_RENDER_TARGET_URL: 'https://demo.yawp.school',
      MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
    });

    expect(isMarketingStudioEnabled()).toBe(false);
  });
});

describe('getMarketingRenderTarget', () => {
  test('normalizes a trailing slash', () => {
    setEnv({
      MARKETING_STUDIO_ENABLED: 'on',
      MARKETING_RENDER_TARGET_URL: 'https://demo.yawp.school/',
      MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
    });

    expect(getMarketingRenderTarget()).toBe('https://demo.yawp.school');
  });

  test('rejects a target that is not an http url', () => {
    for (const url of [
      'demo.yawp.school',
      'file:///etc/passwd',
      'javascript:alert(1)',
    ]) {
      setEnv({
        MARKETING_STUDIO_ENABLED: 'on',
        MARKETING_RENDER_TARGET_URL: url,
        MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
      });

      expect(getMarketingRenderTarget()).toBeNull();
    }
  });

  test('allows localhost for local development', () => {
    setEnv({
      MARKETING_STUDIO_ENABLED: 'on',
      MARKETING_RENDER_TARGET_URL: 'http://localhost:3000',
      MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
    });

    expect(getMarketingRenderTarget()).toBe('http://localhost:3000');
  });

  test('hides the studio when the target is production or an unknown host', () => {
    for (const url of ['https://yawp.school', 'https://example.com']) {
      setEnv({
        MARKETING_STUDIO_ENABLED: 'on',
        MARKETING_RENDER_TARGET_URL: url,
        MARKETING_RENDER_TARGET_IS_DEMO: 'confirmed',
      });
      expect(getMarketingRenderTarget()).toBeNull();
      expect(isMarketingStudioEnabled()).toBe(false);
    }
  });
});
