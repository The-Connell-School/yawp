import { describe, expect, test } from 'bun:test';
import {
  formatLastAdminEditLine,
  readLastAdminEdit,
  withLastAdminEdit,
} from './assignment-type-admin-provenance.server';

describe('assignment type admin provenance', () => {
  test('reads stamped metadata from gradingPromptConfigJson', () => {
    const meta = readLastAdminEdit({
      gradingInstructionsOverride: 'x',
      _lastAdminEdit: {
        updatedAt: '2026-10-26T12:00:00.000Z',
        source: 'platform',
        updatedBy: 'bryant@yawp.school',
      },
    });

    expect(meta).toEqual({
      updatedAt: '2026-10-26T12:00:00.000Z',
      source: 'platform',
      updatedBy: 'bryant@yawp.school',
    });
  });

  test('merges provenance without dropping other prompt config keys', () => {
    const next = withLastAdminEdit(
      { gradingInstructionsOverride: 'keep me' },
      { source: 'platform', updatedBy: 'dev.admin@yawp.local' }
    );

    expect(next).toMatchObject({
      gradingInstructionsOverride: 'keep me',
      _lastAdminEdit: {
        source: 'platform',
        updatedBy: 'dev.admin@yawp.local',
        updatedAt: expect.any(String),
      },
    });
  });

  test('formats a human-readable last-edit line', () => {
    const line = formatLastAdminEditLine(
      new Date('2026-10-26T12:00:00.000Z'),
      readLastAdminEdit({
        _lastAdminEdit: {
          updatedAt: '2026-10-26T12:00:00.000Z',
          source: 'internal',
          updatedBy: 'bryant@yawp.school',
        },
      })
    );

    expect(line).toContain('Yawp Internal');
    expect(line).toContain('bryant@yawp.school');
  });
});
