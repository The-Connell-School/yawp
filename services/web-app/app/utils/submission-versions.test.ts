import { describe, expect, it } from 'bun:test';
import {
  displaySubmissionTitle,
  partitionSubmissionsByArchive,
  versionLabelForActiveSubmission,
} from './submission-versions';

describe('partitionSubmissionsByArchive', () => {
  it('splits active vs archived preserving order', () => {
    const a = { id: '1', archivedAt: null };
    const b = { id: '2', archivedAt: new Date() };
    const c = { id: '3', archivedAt: null };
    const { active, archived } = partitionSubmissionsByArchive([a, b, c]);
    expect(active.map((x) => x.id)).toEqual(['1', '3']);
    expect(archived.map((x) => x.id)).toEqual(['2']);
  });
});

describe('versionLabelForActiveSubmission', () => {
  it('assigns v1 oldest and vN newest among active only', () => {
    const active = [
      { id: 'new', archivedAt: null },
      { id: 'old', archivedAt: null },
    ];
    expect(versionLabelForActiveSubmission(active, 'new')).toBe(2);
    expect(versionLabelForActiveSubmission(active, 'old')).toBe(1);
  });

  it('returns null when id not in active list', () => {
    expect(versionLabelForActiveSubmission([], 'x')).toBeNull();
  });
});

describe('displaySubmissionTitle', () => {
  it('uses Untitled when empty and appends version', () => {
    expect(displaySubmissionTitle('', 2, 'Untitled submission')).toBe(
      'Untitled submission · v2'
    );
  });

  it('uses title when present', () => {
    expect(displaySubmissionTitle('My Essay', 1, 'Untitled submission')).toBe(
      'My Essay · v1'
    );
  });
});
