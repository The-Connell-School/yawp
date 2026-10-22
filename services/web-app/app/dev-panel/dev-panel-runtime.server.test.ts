import { describe, expect, test } from 'bun:test';
import {
  devPanelEnvBadge,
  isDevPanelBuildEnabled,
  isDevPanelRuntimeEnabled,
} from './dev-panel-runtime.server';

describe('dev panel runtime gate', () => {
  test('production build and runtime are disabled', () => {
    const env = {
      YAWP_ENVIRONMENT: 'production',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/yawp',
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
});
