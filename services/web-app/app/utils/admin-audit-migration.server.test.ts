import { afterEach, expect, test } from 'bun:test';
import { auditMovedToInternal, internalAuditDestination } from './admin-audit-migration.server';
const names = ['INTERNAL_ADMIN_AUDIT_MOVED', 'YAWP_INTERNAL_URL', 'YAWP_ENVIRONMENT', 'PREVIEW_SLUG', 'NODE_ENV'];
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
afterEach(() => { for (const [name, value] of Object.entries(original)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
test('legacy gate defaults off and explicit rollout enables it', () => {
  delete process.env.INTERNAL_ADMIN_AUDIT_MOVED;
  expect(auditMovedToInternal()).toBe(false);
  process.env.INTERNAL_ADMIN_AUDIT_MOVED = 'true';
  expect(auditMovedToInternal()).toBe(true);
});
test('destination follows production runtime and demo deployment precedence', () => {
  delete process.env.YAWP_INTERNAL_URL; delete process.env.PREVIEW_SLUG; delete process.env.YAWP_ENVIRONMENT;
  process.env.NODE_ENV = 'production';
  expect(internalAuditDestination()).toBe('https://internal.yawp.school/audit?env=production');
  process.env.PREVIEW_SLUG = 'demo'; process.env.YAWP_ENVIRONMENT = 'staging';
  expect(internalAuditDestination()).toBe('https://internal.yawp.school/audit?env=demo');
  delete process.env.PREVIEW_SLUG; process.env.YAWP_ENVIRONMENT = 'demo';
  expect(internalAuditDestination()).toBe('https://internal.yawp.school/audit?env=demo');
  process.env.YAWP_INTERNAL_URL = 'http://localhost:3127';
  expect(internalAuditDestination()).toBe('http://localhost:3127/audit?env=demo');
});
