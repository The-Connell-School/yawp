import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { document: { findMany: mock() } };

mock.module('~/utils/db.server', () => ({ prisma }));

const { listGroupSubmitNudges } = await import('./nudges.server');

afterAll(() => {
  mock.restore();
});

const SAM = 'member-1';
const TAYLOR = 'member-2';

const draft = (overrides: any = {}) => ({
  id: 'doc-1',
  title: 'Untitled',
  assignment: { title: 'Expansion Plan' },
  group: {
    label: 'Group 2',
    members: [
      {
        membershipId: SAM,
        submittedAt: new Date('2026-08-22T10:00:00Z'),
        membership: { user: { name: 'Sam Reyes' } },
      },
      {
        membershipId: TAYLOR,
        submittedAt: null,
        membership: { user: { name: 'Taylor Nguyen' } },
      },
    ],
  },
  ...overrides,
});

/**
 * The last gap in the every-member rule: a student who is being waited on, or
 * who is waiting, has no way to know unless they happen to open the draft.
 */
describe('listGroupSubmitNudges', () => {
  beforeEach(() => {
    prisma.document.findMany.mockReset().mockResolvedValue([draft()]);
  });

  const list = (membershipId = TAYLOR) =>
    listGroupSubmitNudges({ membershipId });

  test('tells a student their group is waiting on them', async () => {
    const [nudge] = await list(TAYLOR);

    expect(nudge.documentId).toBe('doc-1');
    expect(nudge.waitingOnViewer).toBe(true);
    expect(nudge.readiness.submittedCount).toBe(1);
    expect(nudge.readiness.total).toBe(2);
  });

  test('tells a student who has pressed who the group is waiting on', async () => {
    const [nudge] = await list(SAM);

    expect(nudge.waitingOnViewer).toBe(false);
    expect(nudge.readiness.waitingOn.map((member) => member.name)).toEqual([
      'Taylor Nguyen',
    ]);
  });

  test('names the draft the way the student knows it', async () => {
    const [nudge] = await list();

    expect(nudge.title).toBe('Expansion Plan');
    expect(nudge.groupLabel).toBe('Group 2');
  });

  test('falls back to the document title when there is no assignment', async () => {
    // A student-share draft belongs to no assignment at all.
    prisma.document.findMany.mockResolvedValue([
      draft({ assignment: null, title: 'Our zine' }),
    ]);

    const [nudge] = await list();

    expect(nudge.title).toBe('Our zine');
  });

  test('a draft with no title anywhere still reads as something', async () => {
    prisma.document.findMany.mockResolvedValue([
      draft({ assignment: null, title: '   ' }),
    ]);

    const [nudge] = await list();

    expect(nudge.title).toBe('Shared draft');
  });

  test('only looks at drafts this student is an active member of', async () => {
    await list();

    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(TAYLOR);
    expect(JSON.stringify(where)).toContain('removedAt');
  });

  test('leaves out drafts that are already in', async () => {
    // A submitted draft has nothing left to press, and a dashboard nagging
    // about work already handed in is a dashboard people learn to ignore.
    await list();

    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"unsubmittedAt":null');
    expect(JSON.stringify(where)).toContain('none');
  });

  test('only collaborative rooms, so nothing here touches solo work', async () => {
    await list();

    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(where.assignmentType).toEqual({
      is: { collaborationSupported: true },
    });
    expect(where.deletedAt).toBeNull();
  });

  test('a group where everyone has pressed produces no nudge', async () => {
    // Defensive: the submission is written in the same breath as the last
    // press, but a page loaded between the two should not tell a group they are
    // waiting on nobody.
    prisma.document.findMany.mockResolvedValue([
      draft({
        group: {
          label: 'Group 2',
          members: [
            {
              membershipId: SAM,
              submittedAt: new Date('2026-08-22T10:00:00Z'),
              membership: { user: { name: 'Sam Reyes' } },
            },
          ],
        },
      }),
    ]);

    expect(await list(SAM)).toEqual([]);
  });

  test('a draft with no group is not a group draft', async () => {
    prisma.document.findMany.mockResolvedValue([draft({ group: null })]);

    expect(await list()).toEqual([]);
  });
});
