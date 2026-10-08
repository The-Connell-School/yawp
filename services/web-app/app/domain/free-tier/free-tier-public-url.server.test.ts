import { afterEach, describe, expect, test } from 'bun:test';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';

const saved: Record<string, string | undefined> = {};

function save(name: string) {
  saved[name] = process.env[name];
}

function restore(name: string) {
  if (saved[name] === undefined) delete process.env[name];
  else process.env[name] = saved[name];
}

describe('freeTierPublicAppOrigin', () => {
  afterEach(() => {
    for (const name of ['PRIMARY_APP_URL', 'YAWP_ENVIRONMENT', 'PREVIEW_SLUG', 'PREVIEW_DOMAIN']) {
      restore(name);
    }
  });

  test('uses PRIMARY_APP_URL when set', () => {
    save('PRIMARY_APP_URL');
    process.env.PRIMARY_APP_URL = 'https://app.example.com/';
    expect(freeTierPublicAppOrigin()).toBe('https://app.example.com');
  });

  test('preview fallback from slug and domain when PRIMARY_APP_URL is absent', () => {
    for (const name of ['PRIMARY_APP_URL', 'YAWP_ENVIRONMENT', 'PREVIEW_SLUG', 'PREVIEW_DOMAIN']) {
      save(name);
    }
    delete process.env.PRIMARY_APP_URL;
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PREVIEW_SLUG = 'pr-416';
    process.env.PREVIEW_DOMAIN = 'preview.yawp.school';
    expect(freeTierPublicAppOrigin()).toBe('https://pr-416.preview.yawp.school');
  });

  test('throws outside preview when PRIMARY_APP_URL is absent', () => {
    save('PRIMARY_APP_URL');
    save('YAWP_ENVIRONMENT');
    delete process.env.PRIMARY_APP_URL;
    delete process.env.YAWP_ENVIRONMENT;
    expect(() => freeTierPublicAppOrigin()).toThrow(/PRIMARY_APP_URL/);
  });
});
