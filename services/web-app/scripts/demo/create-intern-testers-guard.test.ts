import { describe, expect, test } from 'bun:test';
import { assertDemoEnvironment } from './create-intern-testers-guard';

const demo = {
  APP_ENV: 'demo',
  DATABASE_URL: 'postgresql://user:password@demo-db.example.test/yawp_demo',
};

describe('intern tester demo guard', () => {
  test('accepts explicit demo deployment markers', () => {
    expect(() => assertDemoEnvironment(demo)).not.toThrow();
    expect(() =>
      assertDemoEnvironment({ ...demo, APP_ENV: undefined, DEPLOY: 'demo' })
    ).not.toThrow();
  });

  test('refuses production even with a demo marker', () => {
    for (const override of [
      { APP_ENV: 'production' },
      { APP_ENV: 'prod' },
      { DEPLOY: 'production' },
      { DEPLOY_ENV: 'prod' },
      { ENVIRONMENT: 'production' },
      { DATABASE_SCHEMA: 'production' },
      {
        DATABASE_URL:
          'postgresql://user:password@yawp-production.example.test/demo',
      },
      {
        DATABASE_URL:
          'postgresql://user:password@demo-db.example.test/yawp_prod',
      },
      {
        DATABASE_URL:
          'postgresql://user:password@demo-db.example.test/demo?schema=production',
      },
      { E2E_DATABASE_URL: demo.DATABASE_URL },
    ]) {
      expect(() => assertDemoEnvironment({ ...demo, ...override })).toThrow();
    }
  });

  test('fails closed for missing, ambiguous or invalid targets', () => {
    for (const env of [
      {},
      { ...demo, APP_ENV: undefined },
      { ...demo, DEPLOY: 'staging' },
      { ...demo, DATABASE_URL: undefined },
      { ...demo, DATABASE_URL: 'invalid' },
      { ...demo, DATABASE_URL: 'https://demo-db.example.test/demo' },
      {
        ...demo,
        DATABASE_URL: 'postgresql://user:password@db.example.test/demo',
      },
    ]) {
      expect(() => assertDemoEnvironment(env)).toThrow();
    }
  });

  test('never includes connection credentials in errors', () => {
    try {
      assertDemoEnvironment({
        ...demo,
        DATABASE_URL:
          'postgresql://secret-user:secret-password@production-db.example.test/demo',
      });
      throw new Error('Expected refusal');
    } catch (error) {
      expect(String(error)).not.toContain('secret-user');
      expect(String(error)).not.toContain('secret-password');
    }
  });
});
