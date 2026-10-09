import { describe, expect, mock, test } from 'bun:test';
import {
  catalogKeyForAssignmentType,
  findReleasedRubricRevisionId,
  shouldUseInternalRubricRelease,
} from './rubric-release.server';

const classes = (rows: { id: string; orgId: string | null }[]) => ({
  class: {
    findMany: mock(async () =>
      rows.map((row) => ({ id: row.id, school: { organizationId: row.orgId } }))
    ),
  },
});

describe('shouldUseInternalRubricRelease', () => {
  test('one school: the internal_rubrics flag decides for that school', async () => {
    const isEnabled = mock(async () => true);
    const db = classes([{ id: 'c1', orgId: 'org-1' }, { id: 'c2', orgId: 'org-1' }]);
    expect(await shouldUseInternalRubricRelease(['c1', 'c2'], { db, isEnabled })).toBe(true);
    expect(isEnabled.mock.calls).toEqual([['internal_rubrics', 'org-1']] as any);
    const off = mock(async () => false);
    expect(await shouldUseInternalRubricRelease(['c1'], { db, isEnabled: off })).toBe(false);
  });

  test('no classes, unknown classes or classes from several schools keep the default pin without reading the flag', async () => {
    const isEnabled = mock(async () => true);
    expect(await shouldUseInternalRubricRelease([], { db: classes([]), isEnabled })).toBe(false);
    expect(await shouldUseInternalRubricRelease(['c1', 'missing'], { db: classes([{ id: 'c1', orgId: 'org-1' }]), isEnabled })).toBe(false);
    expect(await shouldUseInternalRubricRelease(['c1', 'c2'], { db: classes([{ id: 'c1', orgId: 'org-1' }, { id: 'c2', orgId: 'org-2' }]), isEnabled })).toBe(false);
    expect(await shouldUseInternalRubricRelease(['c1'], { db: classes([{ id: 'c1', orgId: null }]), isEnabled })).toBe(false);
    expect(isEnabled).not.toHaveBeenCalled();
  });

  test('a failing read never blocks assignment creation', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const broken = { class: { findMany: mock(async () => { throw new Error('db down'); }) } };
      expect(await shouldUseInternalRubricRelease(['c1'], { db: broken, isEnabled: async () => true })).toBe(false);
      const db = classes([{ id: 'c1', orgId: 'org-1' }]);
      expect(await shouldUseInternalRubricRelease(['c1'], { db, isEnabled: async () => { throw new Error('flag'); } })).toBe(false);
    } finally {
      console.warn = warn;
    }
  });
});

describe('catalogKeyForAssignmentType', () => {
  test('mirrors the pin trigger: library rubric with a current revision, else the per-type baseline', () => {
    expect(catalogKeyForAssignmentType({ id: 't1', rubricId: 'r1', rubric: { name: 'daily-pages-engagement', currentRevisionId: 'rev-1' }, rubricBaseline: null })).toBe('daily-pages-engagement');
    expect(catalogKeyForAssignmentType({ id: 't1', rubricId: 'r1', rubric: { name: 'daily-pages-engagement', currentRevisionId: null }, rubricBaseline: { rubricRevisionId: 'b1' } })).toBeNull();
    expect(catalogKeyForAssignmentType({ id: 't1', rubricId: null, rubric: null, rubricBaseline: { rubricRevisionId: 'b1' } })).toBe('assignment-type:t1');
    expect(catalogKeyForAssignmentType({ id: 't1', rubricId: null, rubric: null, rubricBaseline: null })).toBeNull();
  });
});

describe('findReleasedRubricRevisionId', () => {
  const db = (release: { rubricRevisionId: string; rubricRevision: { rubricName: string } } | null) => ({
    assignmentType: { findUnique: mock(async () => ({ id: 't1', rubricId: 'r1', rubric: { name: 'lib', currentRevisionId: 'cur' }, rubricBaseline: null })) },
    rubricRelease: { findUnique: mock(async () => release) },
  });

  test('returns the released revision only when it belongs to the type’s rubric', async () => {
    expect(await findReleasedRubricRevisionId(db({ rubricRevisionId: 'rel', rubricRevision: { rubricName: 'lib' } }), 't1')).toBe('rel');
    expect(await findReleasedRubricRevisionId(db(null), 't1')).toBeNull();
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect(await findReleasedRubricRevisionId(db({ rubricRevisionId: 'rel', rubricRevision: { rubricName: 'other' } }), 't1')).toBeNull();
    } finally {
      console.warn = warn;
    }
  });
});

test('the retired INTERNAL_DEMO_RUBRICS_ENABLED env var and internal-schema lookup are gone', async () => {
  const root = new URL('../../', import.meta.url);
  const env = await Bun.file(new URL('utils/env.server.ts', root)).text();
  const deployment = await Bun.file(new URL('utils/assignment-deployment.server.ts', root)).text();
  expect(env).not.toContain('INTERNAL_DEMO_RUBRICS_ENABLED');
  expect(deployment).not.toContain('internal-demo-rubrics');
  expect(await Bun.file(new URL('domain/rubrics/internal-demo-rubrics.server.ts', root)).exists()).toBe(false);
});
