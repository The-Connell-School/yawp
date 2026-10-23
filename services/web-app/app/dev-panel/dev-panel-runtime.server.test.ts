import { describe, expect, test } from 'bun:test';
import {
  devPanelEnvBadge,
  isDevPanelBuildEnabled,
  isDevPanelRuntimeEnabled,
} from './dev-panel-runtime.server';

describe('dev panel runtime gate', () => {
  test('production build and runtime are disabled', () => {
    const env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/yawp',
    } as unknown as NodeJS.ProcessEnv;
    expect(isDevPanelBuildEnabled(env)).toBe(false);
    expect(isDevPanelRuntimeEnabled(env)).toBe(false);
  });

  test('SLUG=demo without PREVIEW_SLUG does not enable panel', () => {
    const env = {
      SLUG: 'demo',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@remote:5432/yawp',
    } as unknown as NodeJS.ProcessEnv;
    expect(isDevPanelBuildEnabled(env)).toBe(false);
    expect(isDevPanelRuntimeEnabled(env)).toBe(false);
  });

  test('demo enables panel', () => {
    const env = {
      YAWP_ENVIRONMENT: 'demo',
      PREVIEW_SLUG: 'demo',
      PR_NUMBER: '',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@remote:5432/yawp',
    } as unknown as NodeJS.ProcessEnv;
    expect(isDevPanelRuntimeEnabled(env)).toBe(true);
    expect(devPanelEnvBadge(env)).toBe('Demo');
  });

  test('YAWP_ENVIRONMENT=demo enables panel without preview slug', () => {
    const env = {
      YAWP_ENVIRONMENT: 'demo',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@remote:5432/yawp',
    } as unknown as NodeJS.ProcessEnv;
    expect(isDevPanelRuntimeEnabled(env)).toBe(true);
    expect(devPanelEnvBadge(env)).toBe('Demo');
  });

  test('local dev enables panel', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/yawp',
    } as unknown as NodeJS.ProcessEnv;
    expect(isDevPanelRuntimeEnabled(env)).toBe(true);
    expect(devPanelEnvBadge(env)).toBe('Dev');
  });

  test('preview host does not enable panel', () => {
    const env = {
      YAWP_ENVIRONMENT: 'preview',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@preview-postgres:5432/yawp_pr_1',
    } as unknown as NodeJS.ProcessEnv;
    expect(isDevPanelRuntimeEnabled(env)).toBe(false);
  });

  test('preview yawp with demo slug and no PR enables panel', () => {
    const env = {
      YAWP_ENVIRONMENT: 'preview',
      PREVIEW_SLUG: 'demo',
      PR_NUMBER: '',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@remote:5432/yawp',
    } as unknown as NodeJS.ProcessEnv;
    expect(isDevPanelBuildEnabled(env)).toBe(true);
    expect(isDevPanelRuntimeEnabled(env)).toBe(true);
    expect(devPanelEnvBadge(env)).toBe('Demo');
  });

  test('preview gate E2E dev server does not enable panel over legacy beaker', () => {
    const env = {
      YAWP_ENVIRONMENT: 'preview',
      PREVIEW_SLUG: 'pr-e2e-gate',
      PR_NUMBER: '1',
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/yop_e2e',
    } as unknown as NodeJS.ProcessEnv;
    expect(isDevPanelRuntimeEnabled(env)).toBe(false);
  });
});
