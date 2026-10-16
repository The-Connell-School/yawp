import { describe, expect, test } from 'bun:test';
import {
  formatPlatformApiAuditRow,
  parsePlatformApiAuditRange,
  splitStoredEndpoint,
} from './internal-platform-api-audit-list.server';

describe('internal platform api audit list', () => {
  test('parses inclusive calendar-day ranges in UTC', () => {
    const range = parsePlatformApiAuditRange({ since: '2026-10-01', until: '2026-10-03' });
    expect(range.since.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(range.until.toISOString()).toBe('2026-10-04T00:00:00.000Z');
  });

  test('splits stored method and path without request bodies', () => {
    expect(splitStoredEndpoint('POST /api/internal/v1/feature-flags/demo')).toEqual({
      method: 'POST',
      endpoint: '/api/internal/v1/feature-flags/demo',
    });
    const row = formatPlatformApiAuditRow({
      id: 'evt-1',
      createdAt: new Date('2026-10-02T12:00:00.000Z'),
      actorEmail: 'ops@yawp.school',
      keyId: 'writer',
      endpoint: 'POST /api/internal/v1/feature-flags/demo',
      result: 'authorized',
      requestHash: 'abc',
    });
    expect(row).toEqual({
      id: 'evt-1',
      keyId: 'writer',
      actor: 'ops@yawp.school',
      method: 'POST',
      endpoint: '/api/internal/v1/feature-flags/demo',
      result: 'authorized',
      timestamp: '2026-10-02T12:00:00.000Z',
    });
    expect('requestHash' in row).toBe(false);
  });
});
