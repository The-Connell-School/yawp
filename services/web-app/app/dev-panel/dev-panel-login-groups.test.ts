import { describe, expect, test } from 'bun:test';
import { devPanelLoginBucket, groupDevPanelLogins } from './dev-panel-login-groups';

describe('devPanelLoginBucket', () => {
  test('classifies students, admins, and teachers', () => {
    expect(devPanelLoginBucket('Student · English 10')).toBe('students');
    expect(devPanelLoginBucket('Principal')).toBe('admins');
    expect(devPanelLoginBucket('Teacher')).toBe('teachers');
  });
});

describe('groupDevPanelLogins', () => {
  test('returns non-empty buckets in stable order', () => {
    const groups = groupDevPanelLogins([
      { email: 'a@yawp.local', label: 'A', role: 'Teacher' },
      { email: 'b@yawp.local', label: 'B', role: 'Student' },
    ]);
    expect(groups.map((g) => g.key)).toEqual(['teachers', 'students']);
  });
});
