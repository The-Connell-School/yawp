import { expect, test } from 'bun:test';
import { mockAdminEnvironment } from './mock-admin-environment';

test('demo slug takes priority over an explicit environment', () => {
  expect(mockAdminEnvironment({ PREVIEW_SLUG: 'demo', YAWP_ENVIRONMENT: 'staging', NODE_ENV: 'production' })).toBe('demo');
});
test('explicit environment takes priority over production runtime', () => {
  expect(mockAdminEnvironment({ YAWP_ENVIRONMENT: 'preview', NODE_ENV: 'production' })).toBe('preview');
});
test('production runtime defaults to production', () => {
  expect(mockAdminEnvironment({ NODE_ENV: 'production' })).toBe('production');
});
test('nonproduction runtime defaults to development', () => {
  expect(mockAdminEnvironment({ NODE_ENV: 'test' })).toBe('development');
  expect(mockAdminEnvironment({})).toBe('development');
});
